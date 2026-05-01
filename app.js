const VISION_API_KEY = 'AIzaSyBt6kcIYAMY3H6CmKD_FlEMqLBOdkkGDpU';
const CLIENT_ID = '356564967624-454aiiodg41u0l1ialidtmhlpj8erdtp.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;

// 1. Initialize Google Auth
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) return;
            accessToken = resp.access_token;
            document.getElementById('auth_btn').innerText = "Logged In";
            document.getElementById('app_content').style.display = 'block';
        }
    });
}

function gapiLoaded() { /* gapi.load logic if needed for older Drive V3 methods */ }

document.getElementById('auth_btn').onclick = () => {
    tokenClient.requestAccessToken();
};

// 2. Vision API Processing
document.getElementById('card_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target.result;
        document.getElementById('status_msg').innerText = "AI is reading the card...";
        
        try {
            const rawText = await performOCR(base64);
            const contact = parseOCRText(rawText);
            
            // Fill UI
            document.getElementById('field_name').value = contact.name || "";
            document.getElementById('field_email').value = contact.email || "";
            document.getElementById('editor_section').style.display = 'block';
            document.getElementById('status_msg').innerText = "Scanning complete!";
        } catch (err) {
            console.error(err);
            document.getElementById('status_msg').innerText = "OCR failed. Try again.";
        }
    };
    reader.readAsDataURL(file);
});

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