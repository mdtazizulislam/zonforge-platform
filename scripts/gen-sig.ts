import { buildCollectorSignature } from '../packages/auth-utils/src/api-key.ts'
import { createHmac } from 'crypto'

const body = {
  connectorId: "00000000-0000-0000-0000-000000000099",
  sourceType:  "m365_entra",
  batchId:     "00000000-0000-0000-0000-000000000004",
  events: [
    {
      event_action:  "login_failed",
      actor_ip:      "203.0.113.42",
      actor_user_id: "alice@test.internal",
      outcome:       "failure",
      timestamp:     "2026-03-25T15:00:00Z"
    },
    {
      event_action:  "login_success",
      actor_ip:      "203.0.113.42",
      actor_user_id: "alice@test.internal",
      outcome:       "success",
      timestamp:     "2026-03-25T15:02:30Z"
    }
  ]
}

const secret = "changeme_min_32_chars_local_dev_only"
const ts     = Math.floor(Date.now() / 1000)
const sig    = buildCollectorSignature(body, secret, ts)

// Output body and signature for use in curl
console.log("BODY=" + JSON.stringify(body))
console.log("SIG="  + sig)
console.log("TS="   + ts)
