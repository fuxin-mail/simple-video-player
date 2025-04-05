import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// MySQL 连接池单例
let pool = null

// JSON文件路径
const getJsonFilePath = () => {
  try {
    // 获取当前文件的目录
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // 项目根目录
    const rootDir = path.resolve(__dirname, '../');
    return path.join(rootDir, 'data', 'simple-video-player.json');
  } catch (error) {
    // 降级方案
    return path.join(process.cwd(), 'data', 'simple-video-player.json');
  }
}

// JSON文件路径
const jsonFilePath = getJsonFilePath();

// 配置缓存
let configCache = null;

/**
 * 解析数据库连接字符串(DSN)
 * 示例: username:password@hostname:port/database
 */
export function parseDSN(dsn) {
  // 解析 DSN 字符串
  const [auth, rest] = dsn.split('@')
  const [username, password] = auth.split(':')
  const [host, dbName] = rest.split('/')
  const [hostname, port] = host.split(':')
  
  return {
    host: hostname.replace('tcp(', '').replace(')', ''),
    port: parseInt(port),
    user: username,
    password: password,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    queueLimit: 0
  }
}

/**
 * 确保JSON文件和目录存在
 */
export async function ensureJsonStorage() {
  try {
    // 确保目录存在
    const dir = path.dirname(jsonFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(jsonFilePath)) {
      fs.writeFileSync(jsonFilePath, JSON.stringify({}), 'utf8');
      configCache = {};
    } else if (configCache === null) {
      // 只有在缓存为null时才读取文件
      const data = fs.readFileSync(jsonFilePath, 'utf8');
      try {
        configCache = JSON.parse(data || '{}');
      } catch (error) {
        console.error('JSON文件解析失败:', error);
        configCache = {};
      }
    }
    
    return true;
  } catch (error) {
    console.error('初始化JSON存储失败:', error);
    configCache = {};
    return false;
  }
}

/**
 * 从JSON文件读取配置
 */
export async function readJsonConfig() {
  await ensureJsonStorage();

  return configCache || {};
}

/**
 * 写入配置到JSON文件
 */
export async function writeJsonConfig(config) {
  try {
    await ensureJsonStorage();

    configCache = config;
    await fs.promises.writeFile(jsonFilePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入JSON配置失败:', error);
    return false;
  }
}

/**
 * 初始化数据库连接池（单例模式）
 * @param {string} dsn 数据库连接字符串
 * @returns {Promise<mysql.Pool|null>} MySQL连接池实例或null
 */
export async function initializePool(dsn) {
  if (!dsn) {
    console.log('未提供 DSN，将使用JSON文件存储')
    await ensureJsonStorage();
    return null;
  }
  
  try {
    if (!pool) {
      console.log('初始化 MySQL 连接池')
      pool = mysql.createPool(parseDSN(dsn))

      // 测试连接并创建基础表
      const connection = await pool.getConnection()
      try {
        console.log('测试数据库连接...')
        await connection.query(`
          CREATE TABLE IF NOT EXISTS configs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            config JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `)
        console.log('✅ 数据库连接成功，配置表已就绪')
      } finally {
        connection.release()
      }
    }
    return pool
  } catch (error) {
    console.error('初始化连接池失败:', error)
    pool = null // 重置连接池，以便下次重试
    console.log('降级为使用JSON文件存储')
    await ensureJsonStorage();
    return null
  }
}

/**
 * 获取数据库连接池的当前实例
 * 如果连接池尚未初始化，将返回null
 * @returns {mysql.Pool|null}
 */
export function getPool() {
  return pool
}

/**
 * 关闭数据库连接池
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
    console.log('数据库连接池已关闭')
  }
}

/**
 * 执行数据库查询的辅助函数
 * @param {string} dsn 数据库连接字符串
 * @param {function} callback 回调函数，接收连接对象并返回Promise
 * @returns {Promise<any>} 回调函数的结果
 */
export async function withConnection(dsn, callback) {
  const pool = await initializePool(dsn)
  if (!pool) {
    // 如果连接池初始化失败，表示使用JSON存储
    return null;
  }
  
  const connection = await pool.getConnection()
  try {
    return await callback(connection)
  } finally {
    connection.release()
  }
} 
