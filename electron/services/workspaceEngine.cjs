// 工作空间启动编排引擎
// 负责按顺序执行 pre 脚本、启动软件、执行 post 脚本
// 通过 onProgress 回调向上层（IPC）上报启动进度
const { exec } = require('child_process')
const processManager = require('./processManager.cjs')
const { workspaceDao, batScriptDao, scriptDao, logDao, settingsDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')

// 延时工具，返回 Promise，ms 毫秒后 resolve
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 执行单个脚本
// script: {language, content, delay_ms}
// 脚本失败不中断整体启动，封装为永远 resolve 的 Promise
// 返回 {success, error?, stdout?, stderr?, skipped?}
function executeScript(script) {
  return new Promise(async (resolve) => {
    // 空脚本直接跳过
    if (!script || !script.content || !script.content.trim()) {
      resolve({ success: true, skipped: true })
      return
    }

    // 延时（先 await 再执行）
    if (script.delay_ms && script.delay_ms > 0) {
      await delay(script.delay_ms)
    }

    const language = (script.language || 'cmd').toLowerCase()
    const content = script.content

    // 按 language 选择执行器
    let cmd
    if (language === 'powershell' || language === 'ps') {
      cmd = `powershell -NoProfile -Command ${content}`
    } else {
      // 默认 cmd
      cmd = `cmd.exe /c ${content}`
    }

    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // 脚本失败不中断整体启动，仅返回失败信息
        resolve({ success: false, error: err.message, stdout, stderr })
      } else {
        resolve({ success: true, stdout, stderr })
      }
    })
  })
}

// 启动工作空间
// workspaceId: 工作空间 ID
// onProgress: (progress) => void
//   progress = {phase, softwareId?, softwareName?, status?, message?}
//   phase: 'pre_script' | 'software' | 'post_script' | 'done' | 'error'
//   status: 'pending' | 'running' | 'success' | 'failed'
async function launchWorkspace(workspaceId, onProgress, options = {}) {
  // 进度回调的安全包装，避免回调异常影响启动流程
  const report = (data) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress(data)
      } catch (e) {
        // 忽略回调异常
      }
    }
  }

  try {
    // 1. 查询工作空间（包含软件列表，已按 launch_order 排序）
    const workspace = workspaceDao.get(workspaceId)
    if (!workspace) {
      report({ phase: 'error', status: 'failed', message: t('engine.notFound', { id: workspaceId }) })
      throw new Error(t('engine.notFound', { id: workspaceId }))
    }
    const killBeforeLaunch = settingsDao.get('killBeforeLaunch')
    const restartRunning = options?.restartRunning === true

    // 2. 查询 pre/post 脚本
    const preScript = scriptDao.getByWorkspaceAndType(workspaceId, 'pre')
    const postScript = scriptDao.getByWorkspaceAndType(workspaceId, 'post')

    // 3. 执行 pre 脚本（失败不中断）
    if (preScript) {
      report({ phase: 'pre_script', status: 'running', message: t('engine.preRunning') })
      const result = await executeScript(preScript)
      if (result.success) {
        report({ phase: 'pre_script', status: 'success', message: t('engine.preSuccess') })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'success',
          message: t('engine.preSuccess'),
          message_key: 'engine.preSuccess',
          message_params: {}
        })
      } else {
        report({ phase: 'pre_script', status: 'failed', message: t('engine.preFailed', { message: result.error }) })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'failed',
          message: t('engine.preFailed', { message: result.error }),
          message_key: 'engine.preFailed',
          message_params: { message: result.error }
        })
        // 脚本失败不中断后续流程
      }
    }

    // 4. 按 launch_order 顺序启动每个软件
    const softwareList = workspace.software || []
    for (const software of softwareList) {
      const softwareId = software.id
      const softwareName = software.name

      report({
        phase: 'software',
        softwareId,
        softwareName,
        status: 'pending'
      })

      // 启动前延时
      if (software.delay_ms && software.delay_ms > 0) {
        await delay(software.delay_ms)
      }

      if (killBeforeLaunch || restartRunning) {
        try {
          const terminated = await processManager.terminateByExecutablePath(software.path)
          if (terminated.killed > 0) {
            report({
              phase: 'software',
              softwareId,
              softwareName,
              status: 'running',
              message: t('engine.killedExisting', { count: terminated.killed })
            })
            await delay(300)
          }
        } catch (err) {
          report({
            phase: 'software',
            softwareId,
            softwareName,
            status: 'running',
            message: t('engine.killFailed', { message: err.message })
          })
        }
      }

      report({
        phase: 'software',
        softwareId,
        softwareName,
        status: 'running'
      })

      try {
        await processManager.launchExe(software.path, software.args)
        report({
          phase: 'software',
          softwareId,
          softwareName,
          status: 'success'
        })
        logDao.create({
          workspace_id: workspaceId,
          software_id: softwareId,
          status: 'success',
          message: t('engine.launchSuccess', { name: softwareName }),
          message_key: 'engine.launchSuccess',
          message_params: { name: softwareName }
        })
      } catch (err) {
        // 单个软件失败不中断后续启动，继续下一个
        report({
          phase: 'software',
          softwareId,
          softwareName,
          status: 'failed',
          message: err.message
        })
        logDao.create({
          workspace_id: workspaceId,
          software_id: softwareId,
          status: 'failed',
          message: t('engine.launchFailed', { name: softwareName, message: err.message }),
          message_key: 'engine.launchFailed',
          message_params: { name: softwareName, message: err.message }
        })
      }
    }

    // 5. 执行 post 脚本（失败不中断）
    if (postScript) {
      report({ phase: 'post_script', status: 'running', message: t('engine.postRunning') })
      const result = await executeScript(postScript)
      if (result.success) {
        report({ phase: 'post_script', status: 'success', message: t('engine.postSuccess') })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'success',
          message: t('engine.postSuccess'),
          message_key: 'engine.postSuccess',
          message_params: {}
        })
      } else {
        report({ phase: 'post_script', status: 'failed', message: t('engine.postFailed', { message: result.error }) })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'failed',
          message: t('engine.postFailed', { message: result.error }),
          message_key: 'engine.postFailed',
          message_params: { message: result.error }
        })
      }
    }

    // 6. 所有软件启动完成后，按配置顺序运行脚本库中关联的 BAT/CMD 脚本
    const linkedBatchScripts = batScriptDao.listByWorkspace(workspaceId)
    for (const batchScript of linkedBatchScripts) {
      if (batchScript.delay_ms > 0) {
        await delay(batchScript.delay_ms)
      }

      report({
        phase: 'post_script',
        status: 'running',
        message: t('engine.batchRunning', { name: batchScript.name })
      })

      try {
        await processManager.launchBatch(batchScript.path, batchScript.args)
        report({
          phase: 'post_script',
          status: 'success',
          message: t('engine.batchStarted', { name: batchScript.name })
        })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'success',
          message: t('engine.batchStartedLog', { name: batchScript.name }),
          message_key: 'engine.batchStartedLog',
          message_params: { name: batchScript.name }
        })
      } catch (err) {
        report({
          phase: 'post_script',
          status: 'failed',
          message: t('engine.batchFailed', { name: batchScript.name, message: err.message })
        })
        logDao.create({
          workspace_id: workspaceId,
          software_id: null,
          status: 'failed',
          message: t('engine.batchFailedLog', { name: batchScript.name, message: err.message }),
          message_key: 'engine.batchFailedLog',
          message_params: { name: batchScript.name, message: err.message }
        })
      }
    }

    // 7. 全部完成
    report({ phase: 'done' })
  } catch (err) {
    report({ phase: 'error', status: 'failed', message: err.message })
    throw err
  }
}

module.exports = { launchWorkspace, executeScript, delay }
