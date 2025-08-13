const form = document.getElementById('engineForm');
const modeSelect = document.getElementById('mode');
const sizeWrapper = document.getElementById('sizeWrapper');
const generateBtn = document.getElementById('generateBtn');
const resultsSection = document.getElementById('results');
const resultsContainer = document.getElementById('resultsContainer');

function toggleSize() {
	const mode = modeSelect.value;
	sizeWrapper.style.display = mode === 'image' ? 'block' : 'none';
}
modeSelect.addEventListener('change', toggleSize);
toggleSize();

function renderCopyResult(provider, text) {
	const card = document.createElement('div');
	card.className = 'result-card';
	card.innerHTML = `
		<div class="tag">${provider}</div>
		<h3>Copy Option</h3>
		<pre></pre>
		<div>
			<button class="download">Copy to clipboard</button>
		</div>
	`;
	card.querySelector('pre').textContent = text || '(empty)';
	card.querySelector('.download').addEventListener('click', async () => {
		await navigator.clipboard.writeText(text || '');
		card.querySelector('.download').textContent = 'Copied!';
		setTimeout(() => (card.querySelector('.download').textContent = 'Copy to clipboard'), 1500);
	});
	return card;
}

function renderImageResult(provider, mime, base64) {
	const card = document.createElement('div');
	card.className = 'result-card';
	const dataUrl = `data:${mime};base64,${base64}`;
	card.innerHTML = `
		<div class="tag">${provider}</div>
		<h3>Image Option</h3>
		<img alt="Generated" src="${dataUrl}" />
		<div>
			<a class="download" href="${dataUrl}" download="${provider.toLowerCase()}-option.png">Download</a>
		</div>
	`;
	return card;
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	resultsSection.classList.remove('hidden');
	resultsContainer.innerHTML = '';
	generateBtn.disabled = true;
	generateBtn.textContent = 'Generating…';
	try {
		const fd = new FormData(form);
		const resp = await fetch('/api/generate', {
			method: 'POST',
			body: fd
		});
		if (!resp.ok) {
			const txt = await resp.text();
			throw new Error(txt || 'Request failed');
		}
		const data = await resp.json();
		resultsContainer.innerHTML = '';
		if (data.mode === 'copy') {
			for (const r of data.results || []) {
				resultsContainer.appendChild(renderCopyResult(r.provider, r.text));
			}
		} else {
			for (const r of data.results || []) {
				resultsContainer.appendChild(renderImageResult(r.provider, r.mime, r.base64));
			}
		}
	} catch (err) {
		resultsContainer.innerHTML = '';
		const card = document.createElement('div');
		card.className = 'result-card';
		card.innerHTML = `<h3>Error</h3><pre>${(err && err.message) || err}</pre>`;
		resultsContainer.appendChild(card);
	} finally {
		generateBtn.disabled = false;
		generateBtn.textContent = 'Generate';
	}
});