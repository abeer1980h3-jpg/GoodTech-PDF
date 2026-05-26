// إعداد مكتبة PDF.js للعمل في الخلفية
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// متغيرات عامة
let currentLang = 'ar';
let pdfPagesData = [];
let imageToPdfFiles = []; // مصفوفة لتخزين الصور (تشمل صور الماسح أيضاً)
let html5QrCodeScanner = null;
let currentCameraStream = null;

// --- 1. التحكم بالقائمة والنظام ---
function toggleSidebar() {
    document.getElementById('sidebar-panel').classList.toggle('open');
}

function switchTab(tabId, menuItem) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    menuItem.classList.add('active');
    document.getElementById('sidebar-panel').classList.remove('open');
    if(tabId !== 'qr-tab') stopScanner();
}

function switchTabByIcon(index) {
    document.querySelectorAll('.sidebar-item')[index].click();
}

// --- 2. ماسح المستندات (Document Scanner) ---
async function startDocCamera() {
    const video = document.getElementById('doc-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        currentCameraStream = stream;
        video.srcObject = stream;
    } catch (err) {
        alert("لا يمكن الوصول للكاميرا: " + err.message);
    }
}

function stopDocCamera() {
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        document.getElementById('doc-video').srcObject = null;
    }
}

function captureDocPage() {
    const video = document.getElementById('doc-video');
    const canvas = document.getElementById('doc-canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // عرض الصورة الملتقطة
    const imgPreview = document.getElementById('scanned-img-preview');
    imgPreview.src = canvas.toDataURL('image/jpeg');
    imgPreview.style.display = 'block';
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-controls').style.display = 'flex';
}

function applyScanFilter(filterType) {
    const canvas = document.getElementById('doc-canvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        let avg = (data[i] + data[i+1] + data[i+2]) / 3;
        if (filterType === 'grayscale') {
            data[i] = data[i+1] = data[i+2] = avg;
        } else if (filterType === 'threshold') {
            let val = avg > 128 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = val;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    document.getElementById('scanned-img-preview').src = canvas.toDataURL('image/jpeg');
}

function sendScannedToConverter() {
    const dataUrl = document.getElementById('scanned-img-preview').src;
    fetch(dataUrl).then(res => res.blob()).then(blob => {
        const file = new File([blob], "scanned_doc_" + Date.now() + ".jpg", { type: "image/jpeg" });
        imageToPdfFiles.push(file);
        alert("تم إرسال الصورة للمحول! يمكنك الآن الذهاب لتبويب المحول والتحويل.");
        switchTabByIcon(2); // الانتقال لتبويب المحول
    });
}

// --- 3. أدوات الـ PDF (الدمج والتفكيك) ---
async function handlePdfUpload(event) {
    const files = event.target.files;
    const previewBox = document.getElementById('merge-preview');
    for (const file of Array.from(files)) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 0.3 });
            canvas.height = viewport.height; canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const id = `p_${Date.now()}_${Math.random()}`;
            pdfPagesData.push({ id, origFile: file, pageIndex: i - 1, rotation: 0, dataUrl: canvas.toDataURL() });
            
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<button class="delete-btn" onclick="this.parentElement.remove()">×</button><img src="${canvas.toDataURL()}"><div class="file-name">Page ${i}</div>`;
            previewBox.appendChild(div);
        }
    }
}

async function executeMerge() {
    const { PDFDocument } = PDFLib;
    const finalPdf = await PDFDocument.create();
    for (const p of pdfPagesData) {
        const bytes = await p.origFile.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const [copied] = await finalPdf.copyPages(src, [p.pageIndex]);
        finalPdf.addPage(copied);
    }
    const bytes = await finalPdf.save();
    const blob = new Blob([bytes], {type: "application/pdf"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "Merged.pdf"; a.click();
}

// --- 4. المحول (Images to PDF) ---
function prepareImagesForPdf(event) {
    imageToPdfFiles = Array.from(event.target.files);
    const box = document.getElementById('img-preview-box');
    box.innerHTML = '';
    imageToPdfFiles.forEach(f => {
        const reader = new FileReader();
        reader.onload = e => {
            box.innerHTML += `<div class="preview-item"><img src="${e.target.result}"></div>`;
        };
        reader.readAsDataURL(f);
    });
}

async function convertImagesToPdf() {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    for (const file of imageToPdfFiles) {
        const bytes = await file.arrayBuffer();
        const img = file.type.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], {type: "application/pdf"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "Converted.pdf"; a.click();
}

// --- 5. QR Code ---
function generateQRCode() {
    const text = document.getElementById('qr-text-input').value || "https://goodtech.app";
    document.getElementById('qr-output-box').innerHTML = "";
    new QRCode(document.getElementById('qr-output-box'), { text, width: 150, height: 150 });
}

function startScanner() {
    html5QrCodeScanner = new Html5Qrcode("reader-video-container");
    html5QrCodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
    (data) => { document.getElementById('scanner-result').innerHTML = "🔗 " + data; stopScanner(); });
}

function stopScanner() {
    if (html5QrCodeScanner) html5QrCodeScanner.stop().catch(() => {});
}

// --- 6. المعاين الشامل ---
async function handleUniversalViewer(event) {
    const file = event.target.files[0];
    const stage = document.getElementById('viewer-stage-area');
    const url = URL.createObjectURL(file);
    if(file.type.includes('pdf')) stage.innerHTML = `<iframe src="${url}"></iframe>`;
    else if(file.type.includes('image')) stage.innerHTML = `<img src="${url}">`;
    else if(file.type.includes('video')) stage.innerHTML = `<video controls src="${url}"></video>`;
    else {
        const text = await file.text();
        stage.innerHTML = `<pre><code>${text.slice(0, 2000)}</code></pre>`;
    }
}

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('.lang-text').forEach(el => el.innerText = el.getAttribute(`data-${currentLang}`));
}
