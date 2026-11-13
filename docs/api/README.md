# Validation API (preview)

Designed and documented, **not switched on**. The spec is [`validation-api.openapi.json`](validation-api.openapi.json) (OpenAPI 3.1; open it in any OpenAPI viewer).

| Example | File |
|---|---|
| curl | [`examples/validate.sh`](examples/validate.sh) |
| JavaScript (Node 18+) | [`examples/validate.mjs`](examples/validate.mjs) |
| Python 3 (`requests`) | [`examples/validate.py`](examples/validate.py) |
| Verify a webhook signature (Node / Python) | [`examples/verify-webhook.mjs`](examples/verify-webhook.mjs), [`examples/verify_webhook.py`](examples/verify_webhook.py) |
| GitHub Action | [`../../integrations/github-action/`](../../integrations/github-action/) |

All examples read `IFCVO_API_URL` and `IFCVO_API_KEY` from the environment. Never commit a key.

## Webhook signature

```
X-Signature: t=1763000000,v1=<hex HMAC-SHA256(secret, "1763000000." + raw body)>
```

Compute the HMAC over the **raw** body, compare in constant time, reject timestamps more than 5 minutes off. Answer 2xx within 10 s. 408, 429, 5xx and timeouts are retried at 30 s, 2 min, 10 min, 1 h and 6 h; any other 4xx stops the retries. Every attempt is in the delivery log (`GET /v1/webhooks/{id}/deliveries`). The reference implementation is `src/lib/connectors/webhooks.ts`.

## Power BI

- **CSV:** `GET /v1/exports/validations.csv` (UTF-8 with BOM, CRLF, columns never reordered).
- **OData:** Power BI Desktop → *Get data* → *OData feed* → `<API URL>/odata/Validations`, authentication *Web API* with the key.
