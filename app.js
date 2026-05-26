// إعداد محرك معالجة وتفكيك صفحات الـ PDF
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let currentLang = 'ar';
let pdfPagesData = [];
let currentlyEditingItem = null;
let html5QrCodeScanner = null;
let imageToPdfFiles = []; // مصفوفة لتخزين الصور المراد تحويلها إلى PDF

// تفعيل السحب والإفلات لترتيب عناصر الـ PDF
new Sortable(document.getElementById('merge-preview'), {
    animation: 250,
    onEnd: function () { updateBadges('merge-preview'); }
});

// --- دالة التحكم بالقائمة الجانبية (جديد للموبايل) ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-panel');
    sidebar.classList.toggle('open');
}

// تبديل التبويبات مع إغلاق القائمة تلقائياً على الموبايل عند الاختيار
function switchTab(tabId, menuItem) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    menuItem.classList.add('active');
    
    // إغلاق السايدبار إذا كنا على شاشة هاتف
    document.getElementById('sidebar-panel').classList.remove('open');
    
    if(tabId !== 'qr-tab') stopScanner();
}

function switchTabByIcon(index) {
    const items = document.querySelectorAll('.sidebar-item');
    items[index].click();
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// --- معالجة وتفكيك ملفات الـ PDF ---
async function handlePdfUpload(event) {
    const files = event.target.files;
    const previewBox = document.getElementById('merge-preview');
    const status = document.getElementById('merge-status');

    for (const file of Array.from(files)) {
        status.innerHTML = currentLang === 'ar' ? "⏳ جاري قراءة وتفكيك المستند..." : "⏳ Deconstructing document pages...";
        const arrayBuffer = await file.arrayBuffer();
        
        try {
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.3 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                const itemId = `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                
                pdfPagesData.push({
                    id: itemId, origFile: file, pageIndex: pageNum - 1, rotation: 0, canvasDataUrl: canvas.toDataURL()
                });

                const itemDiv = document.createElement('div');
                itemDiv.className = 'preview-item';
                itemDiv.setAttribute('data-id', itemId);

                itemDiv.innerHTML = `
                    <button class="delete-btn" onclick="removePdfPage('${itemId}', event)">×</button>
                    <span class="badge"></span>
                    <div class="media-preview">
                        <img id="thumb_${itemId}" src="${canvas.toDataURL()}">
                    </div>
                    <div class="file-name" title="${file.name}">${currentLang==='ar'?'صفحة':'Page'} ${pageNum} - ${file.name}</div>
                    <button class="edit-btn" onclick="launchPageEditor('${itemId}', event)">${currentLang==='ar'?'تعديل وتدوير ⚙️':'Rotate & Tune ⚙️'}</button>
                `;
                previewBox.appendChild(itemDiv);
            }
            status.innerHTML = currentLang === 'ar' ? "✅ تمت معالجة الصفحات بنجاح" : "✅ Pages parsed successfully";
            updateBadges('merge-preview');
        } catch (err) {
            status.innerHTML = "❌ Error processing PDF.";
        }
    }
    event.target.value = '';
}

function launchPageEditor(itemId, event) {
    event.stopPropagation();
    const itemObj = pdfPagesData.find(i => i.id === itemId);
    if (!itemObj) return;

    currentlyEditingItem = itemObj;
    const editContent = document.getElementById('edit-zone-content');
    editContent.innerHTML = `
        <div class="edit-preview-frame">
            <img id="modal-edit-img" src="${itemObj.canvasDataUrl}" style="transform: rotate(${itemObj.rotation}deg)">
        </div>
    `;
    openModal('edit-sub-modal');
}

function rotateCurrentItem() {
    if (!currentlyEditingItem) return;
    currentlyEditingItem.rotation = (currentlyEditingItem.rotation + 90) % 360;

    document.getElementById('modal-edit-img').style.transform = `rotate(${currentlyEditingItem.rotation}deg)`;
    document.getElementById(`thumb_${currentlyEditingItem.id}`).style.transform = `rotate(${currentlyEditingItem.rotation}deg)`;
}

function removePdfPage(id, event) {
    event.stopPropagation();
    document.getElementById('merge-preview').querySelector(`[data-id="${id}"]`).remove();
    pdfPagesData = pdfPagesData.filter(i => i.id !== id);
    updateBadges('merge-preview');
}

function updateBadges(boxId) {
    const items = document.getElementById(boxId).getElementsByClassName('preview-item');
    Array.from(items).forEach((item, idx) => { item.querySelector('.badge').innerText = idx + 1; });
}

// بناء ملف الـ PDF الجديد
async function executeMerge() {
    const status = document.getElementById('merge-status');
    const currentOrder = Array.from(document.getElementById('merge-preview').children).map(el => el.getAttribute('data-id'));
    const orderedPages = currentOrder.map(id => pdfPagesData.find(p => p.id === id)).filter(p => p);

    if (orderedPages.length === 0) {
        status.innerText = currentLang === 'ar' ? "⚠️ لا توجد صفحات لتجميعها" : "⚠️ No pages found to compile.";
        return;
    }

    status.innerHTML = "⏳ Processing compiled build...";
    try {
        const { PDFDocument, degrees } = PDFLib;
        const finalPdfDoc = await PDFDocument.create();
        const sourceCache = new Map();

        for (const pObj of orderedPages) {
            if (!sourceCache.has(pObj.origFile.name)) {
                const bytes = await pObj.origFile.arrayBuffer();
                sourceCache.set(pObj.origFile.name, await PDFDocument.load(bytes));
            }
            const srcDoc = sourceCache.get(pObj.origFile.name);
            const [copiedPage] = await finalPdfDoc.copyPages(srcDoc, [pObj.pageIndex]);

            if (pObj.rotation !== 0) {
                const currentRot = copiedPage.getRotation().angle;
                copiedPage.setRotation(degrees((currentRot + pObj.rotation) % 360));
            }
            finalPdfDoc.addPage(copiedPage);
        }

        const mergedBytes = await finalPdfDoc.save();
        downloadFile(mergedBytes, "GoodTech_Compiled.pdf", "application/pdf");
        status.innerHTML = "✅ Done!";
    } catch (err) {
        status.innerHTML = "❌ Build compiled failed.";
    }
}

// --- ميزات تبويب المحول الجديد (Converter) ---

// 1. معاينة وتجهيز الصور لتحويلها إلى PDF
function prepareImagesForPdf(event) {
    const files = event.target.files;
    const previewBox = document.getElementById('img-preview-box');
    previewBox.innerHTML = '';
    imageToPdfFiles = Array.from(files);

    imageToPdfFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'preview-item';
            itemDiv.innerHTML = `
                <div class="media-preview">
                    <img src="${e.target.result}">
                </div>
                <div class="file-name" title="${file.name}">${file.name}</div>
            `;
            previewBox.appendChild(itemDiv);
        }
        reader.readAsDataURL(file);
    });
}

// 2. توليد ملف PDF من الصور المرفوعة
async function convertImagesToPdf() {
    if (imageToPdfFiles.length === 0) {
        alert(currentLang === 'ar' ? "⚠️ الرجاء اختيار صور أولاً!" : "⚠️ Please select images first.");
        return;
    }

    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        for (const file of imageToPdfFiles) {
            const arrayBuffer = await file.arrayBuffer();
            let embeddedImg;

            if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                embeddedImg = await pdfDoc.embedJpg(arrayBuffer);
            } else if (file.type === 'image/png') {
                embeddedImg = await pdfDoc.embedPng(arrayBuffer);
            } else {
                // محاولة معالجة الصيغ الأخرى كـ JPG افتراضياً
                try { embeddedImg = await pdfDoc.embedJpg(arrayBuffer); } 
                catch(e) { embeddedImg = await pdfDoc.embedPng(arrayBuffer); }
            }

            const page = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
            page.drawImage(embeddedImg, {
                x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height
            });
        }

        const pdfBytes = await pdfDoc.save();
        downloadFile(pdfBytes, "GoodTech_Images_Converted.pdf", "application/pdf");
    } catch (err) {
        alert("Error converting images to PDF: " + err.message);
    }
}

// 3. تحويل ملف PDF واستخراج صفحاته كصور منفصلة قابل للتحميل
async function convertPdfToImages(event) {
    const file = event.target.files[0];
    if (!file) return;

    const resultsBox = document.getElementById('pdf-to-img-results');
    resultsBox.innerHTML = currentLang === 'ar' ? "⏳ جاري تحويل المستند إلى صور..." : "⏳ Converting document to images...";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        resultsBox.innerHTML = ''; 

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 }); // دقة عالية للعرض والتحميل
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const imgDataUrl = canvas.toDataURL('image/png');

            const itemDiv = document.createElement('div');
            itemDiv.className = 'preview-item';
            itemDiv.style.height = 'auto';
            itemDiv.style.padding = '10px';

            itemDiv.innerHTML = `
                <div class="media-preview" style="height:140px;">
                    <img src="${imgDataUrl}">
                </div>
                <div class="file-name">${currentLang === 'ar' ? 'صفحة' : 'Page'} ${pageNum}</div>
                <button class="edit-btn" onclick="downloadSingleImage('${imgDataUrl}', 'Page_${pageNum}.png')">📥 ${currentLang === 'ar' ? 'تحميل' : 'Download'}</button>
            `;
            resultsBox.appendChild(itemDiv);
        }
    } catch (err) {
        resultsBox.innerHTML = "❌ Failed to convert PDF to images.";
    }
}

function downloadSingleImage(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
}

// --- محرك الـ QR Code الشامل ---
function generateQRCode() {
    const text = document.getElementById('qr-text-input').value || "https://goodtech.app";
    const box = document.getElementById('qr-output-box');
    box.innerHTML = "";
    new QRCode(box, { text: text, width: 180, height: 180 });
}

function downloadQR() {
    const img = document.getElementById('qr-output-box').querySelector('img');
    if (img) {
        const a = document.createElement('a'); a.href = img.src; a.download = 'goodtech_qr.png'; a.click();
    }
}

function startScanner() {
    document.getElementById('reader-video-container').innerHTML = "<div id='qr-video-engine'></div>";
    html5QrCodeScanner = new Html5Qrcode("qr-video-engine");
    html5QrCodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            document.getElementById('scanner-result').innerHTML = `🔗 <strong>Result:</strong> <a href="${decodedText}" target="_blank">${decodedText}</a>`;
            stopScanner();
        }
    ).catch(err => alert("Camera permission denied or not found."));
}

function stopScanner() {
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().then(() => {
            document.getElementById('reader-video-container').innerHTML = "";
        }).catch(e => {});
    }
}

function scanQrFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const html5QrCode = new Html5Qrcode("reader-video-container");
    html5QrCode.scanFile(file, true)
        .then(decodedText => {
            document.getElementById('scanner-result').innerHTML = `🔗 <strong>Result:</strong> <a href="${decodedText}" target="_blank">${decodedText}</a>`;
        })
        .catch(err => {
            document.getElementById('scanner-result').innerHTML = `<span style='color:var(--danger)'>❌ Failed to read QR code from image.</span>`;
        });
}

// --- المعاين الشامل لجميع أنواع الملفات ---
async function handleUniversalViewer(event) {
    const file = event.target.files[0];
    if (!file) return;

    const stage = document.getElementById('viewer-stage-area');
    stage.innerHTML = "⏳ Processing display render...";
    const blobUrl = URL.createObjectURL(file);

    if (file.type === 'application/pdf') {
        stage.innerHTML = `<iframe src="${blobUrl}"></iframe>`;
    } else if (file.type.startsWith('image/')) {
        stage.innerHTML = `<img src="${blobUrl}">`;
    } else if (file.type.startsWith('video/')) {
        stage.innerHTML = `<video src="${blobUrl}" controls autoplay></video>`;
    } else if (file.type.startsWith('audio/')) {
        stage.innerHTML = `<audio src="${blobUrl}" controls autoplay style="width:80%;"></audio>`;
    } else if (file.type.startsWith('text/') || file.name.endsWith('.js') || file.name.endsWith('.css') || file.name.endsWith('.html') || file.name.endsWith('.json')) {
        const text = await file.text();
        const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        stage.innerHTML = `<pre><code>${safeText}</code></pre>`;
    } else {
        stage.innerHTML = `<div style='text-align:center'><p>📁 No direct preview built-in for this mime-type.</p><br><a class='btn' href='${blobUrl}' download='${file.name}'>Download File</a></div>`;
    }
}

// --- أداة الترجمة واللغات الاحترافية ---
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    
    document.querySelectorAll('.lang-text').forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });

    document.querySelector('.lang-switcher span').innerText = currentLang === 'ar' ? 'English' : 'العربية';
    generateQRCode();
}

function downloadFile(data, fileName, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
}

// تشغيل افتراضي عند بدء التشغيل
window.onload = () => { generateQRCode(); };
