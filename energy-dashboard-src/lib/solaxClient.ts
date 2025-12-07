type SolaxRealtimeResult = {
  success: boolean;
  result?: {
    sn?: string;
    inverterSN?: string;
    acpower?: number;
    yieldtoday?: number;
    yieldtotal?: number;
    feedinpower?: number;
    feedinenergy?: number;
    consumeenergy?: number;
    soc?: number;
    batPower?: number;
    powerdc1?: number;
    powerdc2?: number;
    powerdc3?: number;
    powerdc4?: number;
    inverterStatus?: number;
    uploadTime?: string;
  };
  exception?: string;
};

const BASE_URL = process.env.SOLAX_BASE_URL ?? "https://global.solaxcloud.com";
const API_PATH = "/api/v2/dataAccess/realtimeInfo/get";
const TOKEN_ID = process.env.SOLAX_TOKEN_ID;
const WIFI_SN = process.env.SOLAX_WIFI_SN;
const REQUEST_TIMEOUT = Number(process.env.SOLAX_TIMEOUT ?? 10_000);

export async function fetchSolaxRealtime() {
  if (!TOKEN_ID || !WIFI_SN) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const url = `${BASE_URL}${API_PATH}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        tokenId: TOKEN_ID,
      },
      body: JSON.stringify({ wifiSn: WIFI_SN }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("SolaX API error", response.status, await safeText(response));
      return null;
    }

    const payload = (await response.json()) as SolaxRealtimeResult;
    if (!payload.success || !payload.result) {
      console.warn("SolaX API returned no result", payload.exception);
      return null;
    }

    return payload.result;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error("SolaX API timeout");
      return null;
    }
    console.error("SolaX API request failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
