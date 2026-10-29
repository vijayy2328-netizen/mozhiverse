import {afterEach,describe,expect,it,vi} from "vitest";
import {CachedTranslator,GoogleProvider,MyMemoryProvider,type TranslationProvider} from "./translation.js";
afterEach(()=>vi.unstubAllGlobals());
describe("translation providers",()=>{
  it("uses Google Translate when a key is configured",async()=>{const fetcher=vi.fn(async(_input:RequestInfo|URL)=>Response.json({data:{translations:[{translatedText:"Hello"}]}}));vi.stubGlobal("fetch",fetcher);const result=await new GoogleProvider("server-secret").translate("வணக்கம்","Tamil","English");expect(result).toBe("Hello");expect(String(fetcher.mock.calls[0][0])).toContain("key=server-secret");});
  it("parses the free MyMemory response",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>Response.json({responseStatus:200,responseData:{translatedText:"வணக்கம்"}})));expect(await new MyMemoryProvider().translate("hello","English","Tamil")).toBe("வணக்கம்");});
});
describe("cached translator",()=>{it("uses cache and skips same-language requests",async()=>{const provider:TranslationProvider={translate:vi.fn(async()=>"வணக்கம்")};const t=new CachedTranslator(provider);expect(await t.translate("hello","English","Tamil")).toBe("வணக்கம்");expect(await t.translate("hello","English","Tamil")).toBe("வணக்கம்");expect(provider.translate).toHaveBeenCalledTimes(1);expect(await t.translate("same","Tamil","Tamil")).toBe("same");});});
