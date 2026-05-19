let toolsData = { merge: [], convert: [], viewer: [] };
let currentlyEditingFile = null; 

// تفعيل السحب والترتيب الاحترافي للعناصر المرفوعة
['merge-preview', 'convert-preview', 'viewer-preview'].forEach(id => {
    new Sortable(document.getElementById(id), {
        animation: 200,
        onEnd: function () { updateBadges(id); }
    });
});

// دوال فتح وإغلاق النوافذ (Modals)
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// دالة قائمة الهواتف الذكية المخصصة (يمكن استخدامها مستقبلاً لتوسيع الخيارات)
function toggleMobileMenu() {
    alert("من هنا يمكنك التنقل السريع بين الأدوات في التحديثات القادمة!");
}

// معالجة رفع وقراءة الملفات الحية
function handleFiles(event, toolType) {
    const files = event.target.files;
    const previewBox = document.getElementById(`${toolType}-preview`);
    
    Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        
        if (file.type.startsWith('text/')) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }

        reader.onload = function (e) {
            const fileId = `id_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const arrayBuffer = file.type.startsWith('text/') ? null : e.target.result;
            const textContent = file.type.startsWith('text/') ? e.target.result : null;
            
            let blobUrl = null;
            if (!textContent) {
                blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: file.type }));
            }

            // إسناد زاوية التدوير الافتراضية
            toolsData[toolType].push({
                id: fileId, name: file.name, type: file.type, arrayBuffer: arrayBuffer, textContent: textContent, blobUrl: blobUrl, rotation: 0
            });

            const itemDiv = document.createElement('div');
            itemDiv.className = 'preview-item';
            itemDiv.setAttribute('data-id', fileId);

            let mediaHTML = '';
            if (file.type.startsWith('image/')) {
                mediaHTML = `<img id="thumb_${fileId}" src="${blobUrl}">`;
            } else if (file.type.startsWith('video/')) {
                mediaHTML = `<video src="${blobUrl}" autoplay loop muted playsinline></video>`;
            } else if (file.type === 'application/pdf') {
                mediaHTML = `<div class="file-icon">📄</div>`;
            } else if (file.type.startsWith('text/')) {
                mediaHTML = `<div class="file-icon">📝</div>`;
            } else {
                mediaHTML = `<div class="file-icon">📁</div>`;
            }

            itemDiv.innerHTML = `
                <button class="delete-btn" onclick="removeFile('${toolType}', '${fileId}', event)">×</button>
                <span class="badge"></span>
                <div class="media-preview">${mediaHTML}</div>
                <div class="file-name" title="${file.name}">${file.name}</div>
                <button class="edit-btn" onclick="launchEditor('${toolType}', '${fileId}', event)">تعديل ومعاينة ⚙️</button>
            `;

            previewBox.appendChild(itemDiv);
            updateBadges(`${toolType}-preview`);
        };
    });
    event.target.value = '';
}

// تشغيل محرر المعاينة الفردية والتدوير المتقدم
function launchEditor(toolType, fileId, event) {
    event.stopPropagation();
    const fileObj = toolsData[toolType].find(f => f.id === fileId);
    if (!fileObj) return;

    currentlyEditingFile = fileObj;
    const editContent = document.getElementById('edit-zone-content');
    const rotateBtn = document.getElementById('rotate-btn');
    
    editContent.innerHTML = '';
    rotateBtn.style.display = 'none';

    document.getElementById('edit-modal-title').innerText = `معاينة وتعديل: ${fileObj.name}`;

    if (fileObj.type.startsWith('image/')) {
        editContent.innerHTML = `
            <div class="edit-preview-frame">
                <img id="modal-edit-img" src="${fileObj.blobUrl}" style="transform: rotate(${fileObj.rotation}deg)">
            </div>
        `;
        rotateBtn.style.display = 'inline-block';
    } else if (fileObj.type.startsWith('video/')) {
        editContent.innerHTML = `
            <div class="edit-preview-frame">
                <video src="${fileObj.blobUrl}" controls autoplay></video>
            </div>
        `;
    } else if (fileObj.type.startsWith('text/')) {
        editContent.innerHTML = `
            <div class="edit-preview-frame">
                <pre>${fileObj.textContent}</pre>
            </div>
        `;
    } else if (fileObj.type === 'application/pdf') {
        editContent.innerHTML = `
            <div class="edit-preview-frame">
                <iframe src="${fileObj.blobUrl}" style="width:100%; height:350px; border:none;"></iframe>
            </div>
            <p>يمكنك قراءة وتصفح ملف الـ PDF كاملاً من صندوق المعاينة أعلاه.</p>
        `;
    } else {
        editContent.innerHTML = `<p>هذا النوع من الملفات لا يدعم المعاينة المرئية المباشرة.</p>`;
    }

    openModal('edit-sub-modal');
}

// تنفيذ تدوير الصور
function rotateCurrentImage() {
    if (!currentlyEditingFile) return;

    currentlyEditingFile.rotation = (currentlyEditingFile.rotation + 90) % 360;
    
    const modalImg = document.getElementById('modal-edit-img');
    if (modalImg) modalImg.style.transform = `rotate(${currentlyEditingFile.rotation}deg)`;

    const thumbImg = document.getElementById(`thumb_${currentlyEditingFile.id}`);
    if (thumbImg) thumbImg.style.transform = `rotate(${currentlyEditingFile.rotation}deg)`;
}

function removeFile(toolType, id, event) {
    event.stopPropagation();
    const previewBox = document.getElementById(`${toolType}-preview`);
    const element = previewBox.querySelector(`[data-id="${id}"]`);
    if (element) element.remove();

    const fileObj = toolsData[toolType].find(f => f.id === id);
    if (fileObj && fileObj.blobUrl) URL.revokeObjectURL(fileObj.blobUrl);

    toolsData[toolType] = toolsData[toolType].filter(f => f.id !== id);
    updateBadges(`${toolType}-preview`);
}

function updateBadges(previewBoxId) {
    const items = document.getElementById(previewBoxId).getElementsByClassName('preview-item');
    Array.from(items).forEach((item, index) => {
        item.querySelector('.badge').innerText = index + 1;
    });
}

// دمج ملفات PDF برمجياً
async function executeMerge() {
    const status = document.getElementById('merge-status');
    const currentOrder = Array.from(document.getElementById('merge-preview').children).map(el => el.getAttribute('data-id'));
    const pdfFiles = currentOrder.map(id => toolsData.merge.find(f => f.id === id)).filter(f => f && f.type === 'application/pdf');

    if (pdfFiles.length < 2) {
        status.innerText = "⚠️ يرجى اختيار ملفين PDF على الأقل للدمج.";
        return;
    }

    status.innerHTML = "<span style='color:var(--orange);'>⏳ جاري الدمج...</span>";
    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (const fileObj of pdfFiles) {
            const pdf = await PDFDocument.load(fileObj.arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        download(mergedPdfBytes, "merged_by_pdf24_app.pdf", "application/pdf");
        status.innerHTML = "<span style='color:var(--success);'>✅ تم الدمج والتحميل!</span>";
    } catch (e) {
        status.innerHTML = "<span style='color:var(--danger);'>❌ حدث خطأ أثناء الدمج.</span>";
    }
}

// تحويل الصور وإنشاء مستند PDF المحدث بالكامل
async function executeConversion() {
    const status = document.getElementById('convert-status');
    const currentOrder = Array.from(document.getElementById('convert-preview').children).map(el => el.getAttribute('data-id'));
    const imageFiles = currentOrder.map(id => toolsData.convert.find(f => f.id === id)).filter(f => f && f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
        status.innerText = "⚠️ يرجى رفع صورة واحدة على الأقل للتحويل.";
        return;
    }

    status.innerHTML = "<span style='color:var(--orange);'>⏳ جاري معالجة الصور وحفظ درجات التدوير...</span>";
    try {
        const { PDFDocument, degrees } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        for (const imgObj of imageFiles) {
            let image = imgObj.type.includes("png") ? await pdfDoc.embedPng(imgObj.arrayBuffer) : await pdfDoc.embedJpg(imgObj.arrayBuffer);
            const page = pdfDoc.addPage([image.width, image.height]);
            
            if (imgObj.rotation !== 0) {
                page.setRotation(degrees(imgObj.rotation));
            }
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }

        const pdfBytes = await pdfDoc.save();
        download(pdfBytes, "images_converted_with_rotation.pdf", "application/pdf");
        status.innerHTML = "<span style='color:var(--success);'>✅ تم التحويل بنجاح مع حفظ زوايا التدوير المحددة!</span>";
    } catch (e) {
        console.error(e);
        status.innerHTML = "<span style='color:var(--danger);'>❌ فشل تحويل وتدوير الصور.</span>";
    }
}

function download(data, fileName, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
}
