"""Render/test controller UI in isolated headless Chrome with mocked extension APIs.

This tests browser-side controls, not extension loading or the real game protocol.
"""
import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
from environment import load_local_dependencies
load_local_dependencies()
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


MOCK = """
window.__record = {format:'gt-traffic-v1',startedAt:'2026-10-25T01:00:00.000Z',events:[]};
window.__state = {active:false,phase:'idle',hasRecord:false,count:0,counts:{},markers:[]};
window.chrome = window.chrome || {};
chrome.storage = {local:{get:async()=>({}),set:async()=>{}}};
chrome.runtime = {sendMessage:async m=>{
  let data=true;
  if(m.type==='tabs')data=[{id:7,title:'Local test game'}];
  if(m.type==='status')data={running:false,log:[]};
  if(m.type==='nativeProbe')data={build:'2.81.0_c2cae856e7',source:'resource',target:349641,occupied:false,presets:[{pos:1,name:'Spear'}],boostInventory:2656};
  if(m.type==='nativeRun'){window.__nativeOptions=m.options;data={marchId:'4899549206363294',queueId:'5783737'};}
  if(m.type==='observeStart')Object.assign(__state,{active:true,phase:'recording',hasRecord:true});
  if(m.type==='observeMark'){
    const marker={kind:'marker',elapsedMs:1234,label:m.stage,note:m.note};
    __record.events.push(marker);__state.markers.push(marker);__state.stage=m.stage;
  }
  if(m.type==='observeStop')Object.assign(__state,{active:false,phase:'stopped',reason:'user',count:__record.events.length});
  if(m.type==='observeStatus')data=__state;
  if(m.type==='observeExport')data=__record;
  if(m.type==='observeClear'){__state.hasRecord=false;__state.count=0;__state.markers=[];}
  return {ok:true,data};
}};
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{window.__download=blob;return createURL(blob);};
"""


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'chrome-extension')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    options.binary_location = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1120,1000')
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 10)
    try:
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': MOCK})
        driver.get(f'http://127.0.0.1:{server.server_port}/controller.html')
        wait.until(lambda d: '待命' in d.find_element(By.ID, 'observeStatus').text)
        assert not driver.find_element(By.ID, 'observeExport').is_enabled()
        assert not driver.find_element(By.ID, 'markPreset').is_enabled()
        driver.find_element(By.ID, 'nativeProbe').click()
        wait.until(lambda d: d.find_element(By.ID, 'nativeRun').is_enabled())
        driver.find_element(By.ID, 'nativeBoosts').find_element(By.CSS_SELECTOR, 'option[value="2"]').click()
        driver.find_element(By.ID, 'nativeRun').click()
        wait.until(lambda d: '已確認行軍' in d.find_element(By.ID, 'nativeStatus').text)
        assert driver.execute_script('return window.__nativeOptions') == {'preset': 1, 'target': 349641, 'boosts': 2}
        driver.find_element(By.ID, 'observeStart').click()
        wait.until(lambda d: d.find_element(By.ID, 'markPreset').is_enabled())
        assert not driver.find_element(By.ID, 'run').is_enabled()
        assert not driver.find_element(By.ID, 'capture').is_enabled()
        driver.find_element(By.ID, 'observeNote').send_keys('preset 2')
        driver.find_element(By.ID, 'markPreset').click()
        wait.until(lambda d: 'preset 2' in d.find_element(By.ID, 'observeStatus').text)
        driver.find_element(By.ID, 'markMarch').click()
        driver.find_element(By.ID, 'markBoost').click()
        driver.find_element(By.ID, 'observeStop').click()
        wait.until(lambda d: d.find_element(By.ID, 'observeExport').is_enabled())
        driver.find_element(By.ID, 'observeExport').click()
        text = driver.execute_async_script('window.__download.text().then(arguments[0]);')
        record = json.loads(text)
        assert [event['label'] for event in record['events']] == ['preset', 'march', 'boost']
        assert record['events'][0]['note'] == 'preset 2'
        driver.save_screenshot(str(ROOT / 'research' / 'capture' / 'observer-ui.png'))
        driver.find_element(By.ID, 'observeClear').click()
        wait.until(lambda d: not d.find_element(By.ID, 'observeExport').is_enabled())
        print('PASS: Chrome UI: native probe/options/run and observation start/marks/stop/export/clear verified (mock extension API).')
    finally:
        driver.quit()
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
