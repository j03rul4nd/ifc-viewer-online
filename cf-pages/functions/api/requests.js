import { proxyTo } from '../../lib/proxy.js'

export const onRequest = proxyTo('/requests')
