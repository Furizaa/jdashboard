import { ManagedRuntime } from 'effect'
import { appLayer } from './app-layer'

export const appRuntime = ManagedRuntime.make(appLayer)
