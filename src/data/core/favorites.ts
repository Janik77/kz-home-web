import type { CoreSession } from './session';
import { CoreError } from './errors';
export interface DeviceFavorites {
 read(signal:AbortSignal):Promise<string[]>;
 set(deviceId:string, favorite:boolean, signal:AbortSignal):Promise<void>;
}
export function decodeFavorites(value:unknown):string[] {
 if(!value || typeof value!=='object' || !('device_ids' in value) || !Array.isArray(value.device_ids) || value.device_ids.some(id=>typeof id!=='string'||!id) || new Set(value.device_ids).size!==value.device_ids.length) throw new CoreError('protocol');
 return value.device_ids;
}
export function createDeviceFavorites(session:CoreSession,houseId:string):DeviceFavorites {
 const path=`/v1/houses/${encodeURIComponent(houseId)}/me/device-favorites`;
 return {read:signal=>session.read(path,decodeFavorites,signal),set:async(id,favorite,signal)=>{
  if(!id)throw new CoreError('validation');
  await session.definitionWrite(`${path}/${encodeURIComponent(id)}`,favorite?'PUT':'DELETE',undefined,204,()=>undefined,signal);
 }};
}
