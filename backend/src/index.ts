import { createApp } from './app.js'
import { config } from './config.js'
import { openDb } from './db.js'
import { ensureAdmin, seedDemo } from './seed.js'

const db = openDb(config.dbPath)
ensureAdmin(db)
if (config.seedDemo) seedDemo(db)

createApp(db).listen(config.port, () => console.log(`TransConnect API → http://localhost:${config.port}/api`))
