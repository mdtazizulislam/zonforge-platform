const { spawnSync } = require('node:child_process')

// Intentionally ignore extra npm args (e.g. --coverage from CI wrappers)
// because passing them through can break turbo CLI parsing or package-level runners.
const result = spawnSync('npx turbo run test', {
	stdio: 'inherit',
	shell: true,
})

if (result.error) {
	console.error(result.error)
}

process.exit(result.status ?? 1)
