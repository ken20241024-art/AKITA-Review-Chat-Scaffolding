
import { SessionResult, TeacherTask } from "../types";

/**
 * ==========================================================
 * [ADMIN] GLOBAL CONFIGURATION
 * ----------------------------------------------------------
 * 下記の GLOBAL_GAS_URL に、GASで「新しいデプロイ」を行って発行された
 * 新しいURLを貼り付けて保存してください。
 * 
 * 重要: GASのコードを書き換えた後は、必ず「新しいデプロイ」を実行し
 * 新しく発行されたURLを使う必要があります。
 * ==========================================================
 */
const GLOBAL_GAS_URL = "https://script.google.com/macros/s/AKfycbwWQuO-1OxyaGTCSJREtcPm56PTfGpkjXwYFVEq28yYlyOjgrDab-VcQf26kfqWqOTKDg/exec"; 

/**
 * Retrieves the configured GAS Web App URL.
 * Priority: 1. Manual Dashboard Override (Local Storage) -> 2. Environment Variable -> 3. Hardcoded Default
 */
function getAppsScriptUrl(): string | null {
  // 1. Manual override (Dashboard input in Admin Registry)
  const manualUrl = localStorage.getItem('akita_gas_url');
  if (manualUrl) return manualUrl;

  // 2. Environment variable (VITE_ prefix for Vite/Vercel)
  const viteUrl = (import.meta as any).env?.VITE_GAS_APP_URL;
  if (viteUrl) return viteUrl;

  // 3. Hardcoded global URL (Fallback)
  if (GLOBAL_GAS_URL) return GLOBAL_GAS_URL;

  return null;
}

/**
 * Centrally managed IDs that can be overridden by environment variables or Dashboard.
 */
export const getSpreadsheetId = () => 
  localStorage.getItem('akita_spreadsheet_id') || 
  (import.meta as any).env?.VITE_SPREADSHEET_ID || 
  "1Yv2-eJK2-B01STODsrBj8xSQDjzz7M5ia65awtOCYj8";

export const getAudioFolderId = () => 
  localStorage.getItem('akita_audio_folder_id') || 
  (import.meta as any).env?.VITE_AUDIO_FOLDER_ID || 
  "17xBp_gjpL4Zns6FL1x1ba77jRanP0qMr";

export function getUrlSource(): 'MANUAL' | 'GLOBAL_CODE' | 'ENV' | 'NONE' {
  if (localStorage.getItem('akita_gas_url')) return 'MANUAL';
  if ((import.meta as any).env?.VITE_GAS_APP_URL || process.env.GAS_APP_URL) return 'ENV';
  if (GLOBAL_GAS_URL) return 'GLOBAL_CODE';
  return 'NONE';
}

export async function sendSessionToIntegration(result: SessionResult): Promise<boolean> {
  const url = getAppsScriptUrl();
  if (!url) return false;
  
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'save_session', data: result }),
    });
    return true;
  } catch (error) {
    console.error("Session integration failed:", error);
    return false;
  }
}

export async function updateGlobalTask(task: TeacherTask): Promise<boolean> {
  const url = getAppsScriptUrl();
  if (!url) return false;
  
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'save_task', data: task }),
    });
    return true;
  } catch (error) {
    console.error("Task update failed:", error);
    return false;
  }
}

export async function fetchGlobalTask(): Promise<TeacherTask | null> {
  const url = getAppsScriptUrl();
  if (!url) return null;
  try {
    const response = await fetch(`${url}?action=get_task`);
    if (!response.ok) throw new Error("Network response was not ok");
    const task = await response.json();
    return task as TeacherTask;
  } catch (error) {
    console.warn("Sync failed. Check URL or deployment permissions.", error);
    return null;
  }
}
