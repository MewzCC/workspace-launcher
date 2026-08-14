// 数据持久层统一门面
// 对外暴露数据库连接管理和各 DAO 模块
// 注意：相对路径 require 必须带 .cjs 扩展名，Node CJS 解析器默认不自动尝试 .cjs
const { getDb, closeDb } = require('./database.cjs')

module.exports = {
  getDb,
  closeDb,
  workspaceDao: require('./workspaceDao.cjs'),
  softwareDao: require('./softwareDao.cjs'),
  batScriptDao: require('./batScriptDao.cjs'),
  settingsDao: require('./settingsDao.cjs'),
  scriptDao: require('./scriptDao.cjs'),
  logDao: require('./logDao.cjs'),
  conversationDao: require('./conversationDao.cjs'),
  memoryDao: require('./memoryDao.cjs')
}
