import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './client'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migraciones aplicadas')
process.exit(0)
