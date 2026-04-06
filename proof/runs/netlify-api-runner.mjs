import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const [, , method, dataArg] = process.argv

if (!method || !dataArg) {
  console.error('Usage: node proof/runs/netlify-api-runner.mjs <method> <json-data-or-file>')
  process.exit(1)
}

const rawData = fs.existsSync(dataArg) ? fs.readFileSync(dataArg, 'utf8') : dataArg
const parsed = JSON.parse(rawData)
const payload = JSON.stringify(parsed)
const cli = 'C:\\Users\\vitor\\AppData\\npm\\netlify.cmd'
const result = spawnSync(cli, ['api', method, '--data', payload], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)