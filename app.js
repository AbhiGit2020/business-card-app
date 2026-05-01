const VISION_API_KEY = 'AIzaSyBt6kcIYAMY3H6CmKD_FlEMqLBOdkkGDpU';
const CLIENT_ID = '356564967624-454aiiodg41u0l1ialidtmhlpj8erdtp.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;

// 1. Initialize Google Identity Services
function gisLoaded() {
    console.log("Google Identity Services Script Loaded");
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error) {
                    console.error("Auth Error:", resp.error);
                    return;
                }
                console.log("Access Token Received!");
                accessToken = resp.access_token;
                document.getElementById('auth_btn').innerText = "✅ Logged In";
                document.getElementById('app_content').style.display = 'block';
            }
        });
        console.log("Token Client Initialized");
    } catch (e) {
        console.error("GIS Initialization Failed:", e);
    }
}

// 2. Handle Login Button
document.getElementById('auth_btn').onclick = () => {
    console.log("Login button clicked...");
    if (!tokenClient) {
        alert("Google scripts are still loading. Please wait 5 seconds and try again.");
        return;
    }
    // Request access token (this triggers the popup)
    tokenClient.requestAccessToken({ prompt: 'consent' });
};

// 3. Vision API (Placeholder for gapiLoaded to prevent errors)
function gapiLoaded() { console.log("GAPI Loaded"); }

// ... (Rest of your performOCR and parseOCRText functions below)
async function performOCR(base64Image) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;
    const data = {
        requests: [{
            image: { content: base64Image.split(',')[1] },
            features: [{ type: "TEXT_DETECTION" }]
        }]
    };
    const response = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
    const result = await response.json();
    return result.responses[0].fullTextAnnotation?.text || "";
}

function parseOCRText(text) {
    const lines = text.split('\n');
    return {
        name: lines[0] || "",
        email: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || ""
    };
}