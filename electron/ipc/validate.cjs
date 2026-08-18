// IPC 入参校验工具包（零依赖，纯函数）
// 每个校验器都是一个 (value, path) => sanitizedValue 的函数：
// - 校验失败时抛出 ValidationError（携带路径，便于定位是第几个参数）
// - 校验成功时返回「净化后的新值」，绝不修改原始输入
// 设计原则：
//   1. 契约优先：所有 IPC 通道必须声明 schema；未知字段一律剥离（strict）
//   2. 原型污染防护：任何对象中出现的 __proto__ / constructor / prototype 键直接报错
//   3. 类型收敛：路径/ID/长度全部收敛为明确类型，杜绝“字符串当数字、对象当数组”混用
//   4. 不引入运行时依赖，便于在主进程与测试环境（纯 Node）中复用

class ValidationError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message)
    this.name = 'ValidationError'
    this.code = 'VALIDATION'
  }
}

function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const type = typeof value
  return type === 'object' ? 'object' : type
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// 危险键：一旦出现即视为攻击载荷（原型污染 / 构造器覆写）
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function assertNoDangerousKeys(value, path) {
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new ValidationError(`包含危险键 "${key}"，已拒绝`, path)
    }
  }
}

function validator(name, fn) {
  const wrapped = fn
  wrapped.isValidator = true
  wrapped.validatorName = name
  return wrapped
}

function isValidator(value) {
  return typeof value === 'function' && value.isValidator === true
}

// ===== 基础类型 =====

// 字符串。默认严格（不接受隐式转换）；coerce:true 时允许数字/布尔转字符串
function str(opts = {}) {
  const {
    required = true,
    max = Infinity,
    min = 0,
    trim = false,
    coerce = false,
    pattern = null,
    label = '字符串'
  } = opts
  return validator('str', (value, path) => {
    let v = value
    if (v == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return v
    }
    if (typeof v !== 'string') {
      if (coerce && (typeof v === 'number' || typeof v === 'boolean')) {
        v = String(v)
      } else {
        throw new ValidationError(`期望 ${label}，实际为 ${describe(v)}`, path)
      }
    }
    if (trim) v = v.trim()
    const length = [...v].length
    if (length < min) throw new ValidationError(`${label}长度不能小于 ${min}`, path)
    if (length > max) throw new ValidationError(`${label}长度不能超过 ${max}（当前 ${length}）`, path)
    if (pattern && !pattern.test(v)) {
      throw new ValidationError(`${label}格式不符合要求`, path)
    }
    return v
  })
}

// 有限数字。接受数字与「数字字符串」的隐式收敛；拒绝 NaN/Infinity
function num(opts = {}) {
  const { required = true, min = -Infinity, max = Infinity, integer = false, label = '数字' } = opts
  return validator('num', (value, path) => {
    let v = value
    if (v == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return v
    }
    if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      v = Number(v)
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ValidationError(`期望有限${label}，实际为 ${describe(value)}`, path)
    }
    if (integer && !Number.isInteger(v)) {
      throw new ValidationError(`期望整数${label}`, path)
    }
    if (v < min || v > max) {
      throw new ValidationError(`${label}超出范围 [${min}, ${max}]（当前 ${v}）`, path)
    }
    return v
  })
}

// 正整数 ID（数据库主键）
function id(opts = {}) {
  return num({ integer: true, min: 1, label: '正整数 ID', ...opts })
}

// 布尔值。仅接受真实布尔（拒绝 0/1/"true"，避免隐式真值语义）
function bool({ required = true, label = '布尔值' } = {}) {
  return validator('bool', (value, path) => {
    if (value == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return value
    }
    if (typeof value !== 'boolean') {
      throw new ValidationError(`期望 ${label}，实际为 ${describe(value)}`, path)
    }
    return value
  })
}

// 枚举取值（严格 === 比较）
function oneOf(values, { required = true, label = '枚举值' } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('[validate] oneOf 需要非空枚举数组')
  }
  const set = new Set(values)
  return validator('oneOf', (value, path) => {
    if (value == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return value
    }
    if (!set.has(value)) {
      throw new ValidationError(`期望 ${label} 之一（${values.join(' | ')}），实际为 ${describe(value)}`, path)
    }
    return value
  })
}

// 可选：undefined / null 原样放行，非空值交给子校验器
function optional(subValidator) {
  if (!isValidator(subValidator)) throw new Error('[validate] optional 需要校验器参数')
  return validator('optional', (value, path) => {
    if (value == null) return value
    return subValidator(value, path)
  })
}

// 多选一：依次尝试，全部失败时给出汇总错误
function or(...validatorsList) {
  if (validatorsList.length === 0) throw new Error('[validate] or 需要至少一个校验器')
  for (const item of validatorsList) {
    if (!isValidator(item)) throw new Error('[validate] or 参数必须都是校验器')
  }
  return validator('or', (value, path) => {
    if (value == null) {
      // 全部为 required 子校验器时，null/undefined 交给第一个决定是否报错
      return validatorsList[0](value, path)
    }
    let lastError = null
    for (const item of validatorsList) {
      try {
        return item(value, path)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof ValidationError
      ? new ValidationError(`期望 ${validatorsList.map((item) => item.validatorName).join(' 或 ')}，${lastError.message}`, path)
      : new ValidationError(`期望 ${validatorsList.map((item) => item.validatorName).join(' 或 ')}`, path)
  })
}

// ===== 复合结构 =====

// 严格对象：只保留 shape 中声明的键（strict），未知键静默剥离（保持前后端契约演进兼容）；
// 任何危险键（__proto__ 等）无论是否在 shape 中都会直接报错。
function obj(shape, { required = true, strict = true, label = '对象' } = {}) {
  if (!shape || typeof shape !== 'object' || Array.isArray(shape)) {
    throw new Error('[validate] obj 需要 shape 定义')
  }
  for (const key of Object.keys(shape)) {
    if (!isValidator(shape[key])) {
      throw new Error(`[validate] shape.${key} 必须是校验器`)
    }
  }
  return validator('obj', (value, path) => {
    if (value == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return value
    }
    if (!isPlainObject(value)) {
      throw new ValidationError(`期望 ${label}，实际为 ${describe(value)}`, path)
    }
    assertNoDangerousKeys(value, path)
    const result = {}
    for (const key of Object.keys(shape)) {
      const childPath = path ? `${path}.${key}` : key
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        // 缺失字段：必填校验器会抛错，可选校验器原样放行（不写入结果，保持输出形状）
        shape[key](undefined, childPath)
        continue
      }
      result[key] = shape[key](value[key], childPath)
    }
    if (!strict) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(shape, key)) result[key] = value[key]
      }
      assertNoDangerousKeys(result, path)
    }
    return result
  })
}

// 数组：逐项净化，限制数量
function arr(itemValidator, { required = true, min = 0, max = 200, label = '数组' } = {}) {
  if (!isValidator(itemValidator)) throw new Error('[validate] arr 需要子项校验器')
  return validator('arr', (value, path) => {
    if (value == null) {
      if (required) throw new ValidationError(`期望 ${label}`, path)
      return value
    }
    if (!Array.isArray(value)) {
      throw new ValidationError(`期望 ${label}，实际为 ${describe(value)}`, path)
    }
    if (value.length < min || value.length > max) {
      throw new ValidationError(`${label}长度需在 [${min}, ${max}] 之间（当前 ${value.length}）`, path)
    }
    return value.map((item, index) => itemValidator(item, path ? `${path}[${index}]` : `[${index}]`))
  })
}

// JSON 安全值（用于日志/诊断等任意结构化数据）：
// 只允许 null/boolean/number/string/plain object/array；剥离危险键；限制深度与总字符数
function jsonable({ maxChars = 8000, maxDepth = 8, label = 'JSON 数据' } = {}) {
  const walk = (value, depth, path) => {
    if (value === null) return null
    const type = typeof value
    if (type === 'string') return value
    if (type === 'boolean') return value
    if (type === 'number') {
      if (!Number.isFinite(value)) throw new ValidationError(`${label}包含非有限数字`, path)
      return value
    }
    if (depth >= maxDepth) throw new ValidationError(`${label}嵌套过深（超过 ${maxDepth} 层）`, path)
    if (Array.isArray(value)) {
      return value.map((item, index) => walk(item, depth + 1, path ? `${path}[${index}]` : `[${index}]`))
    }
    if (isPlainObject(value)) {
      assertNoDangerousKeys(value, path)
      const result = {}
      for (const key of Object.keys(value)) {
        const childPath = path ? `${path}.${key}` : key
        result[key] = walk(value[key], depth + 1, childPath)
      }
      return result
    }
    throw new ValidationError(`${label}包含不支持的 ${describe(value)}`, path)
  }
  return validator('jsonable', (value, path) => {
    const sanitized = walk(value, 0, path)
    const serialized = JSON.stringify(sanitized)
    if (serialized != null && serialized.length > maxChars) {
      throw new ValidationError(`${label}过大（超过 ${maxChars} 字符）`, path)
    }
    return sanitized
  })
}

// 文件系统路径：非空、无控制字符（防 NUL/换行注入）、长度受限。
// 不做目录穿越校验——路径来自用户自己的对话框/扫描结果，属用户自主选择。
function path({ required = true, max = 1024, label = '路径' } = {}) {
  return validator('path', (value, pathName) => {
    const v = str({ required, max, trim: true, label })(value, pathName)
    if (v == null) return v
    if (/[\u0000-\u001f\u007f]/.test(v)) {
      throw new ValidationError(`${label}包含非法控制字符`, pathName)
    }
    return v
  })
}

// 任意放行（仅供明确标注的通道使用；不推荐用于信任边界）
function any({ required = true } = {}) {
  return validator('any', (value, path) => {
    if (value == null) {
      if (required) throw new ValidationError('期望值', path)
      return value
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      throw new ValidationError(`不支持 ${describe(value)}`, path)
    }
    return value
  })
}

module.exports = {
  ValidationError,
  isValidator,
  str,
  num,
  id,
  bool,
  oneOf,
  optional,
  or,
  obj,
  arr,
  jsonable,
  path,
  any,
  isPlainObject,
  DANGEROUS_KEYS
}