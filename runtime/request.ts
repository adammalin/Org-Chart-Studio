export type StudioRequester = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
let requester: StudioRequester | undefined;
export function installStudioRequester(next: StudioRequester) { requester = next; }
// Explicit application adapter; native fetch and unrelated browser requests are unchanged.
export const studioRequest: StudioRequester = (input, init) => requester ? requester(input, init) : fetch(input, init);

export async function downloadStudioFile(path:string,fileName:string){
 const response=await studioRequest(path);if(!response.ok)throw Error('The file could not be downloaded.');
 const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
