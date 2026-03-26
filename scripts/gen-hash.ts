import bcrypt from 'bcryptjs'
;(async () => {
	const hash = await bcrypt.hash('zf_audit001_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 10)
	console.log(hash)
})()
