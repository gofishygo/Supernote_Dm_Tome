/**
 * Declare → check → request, per docs.supernote.com/en/plugin-base/permission.
 * "Allow this time only" expires when the plugin closes, so call these before
 * each feature rather than once. Both names are declared in PluginConfig.json.
 */
import {PluginManager} from 'sn-plugin-lib';

export const PERM_READ = 'plugin.permission.FILE:READ';
export const PERM_WRITE = 'plugin.permission.FILE:WRITE';

export class PermissionDenied extends Error {
  constructor(public permission: string, public choice: number) {
    super(`${permission.replace('plugin.permission.', '')} not granted (choice ${choice})`);
  }
}

async function ensure(permission: string, why: string): Promise<void> {
  const has = await PluginManager.hasPermission(permission);
  if (has === 1) {
    return;
  }
  const choice = await PluginManager.requestPermission(permission, why);
  if (choice !== 1 && choice !== 2) {
    throw new PermissionDenied(permission, choice);
  }
}

export const ensureRead = () =>
  ensure(PERM_READ, 'DM Tome reads your notes to list tasks and references.');
export const ensureWrite = () =>
  ensure(PERM_WRITE, 'DM Tome writes tasks into your note as keywords.');
