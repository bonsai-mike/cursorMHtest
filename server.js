import path from 'path';
import fs from 'fs';
import url from 'url';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import sharp from 'sharp';
import OpenAI from 'openai';
import { CohereClient } from 'cohere-ai';

dotenv.config();

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const ext = path.extname(file.originalname || '');
		cb(null, file.fieldname + '-' + uniqueSuffix + ext);
	}
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const stabilityApiKey = process.env.STABILITY_API_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';

const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const cohere = cohereApiKey ? new CohereClient({ token: cohereApiKey }) : null;

function parseSize(sizeStr) {
	if (!sizeStr || typeof sizeStr !== 'string') return { width: 1024, height: 1024 };
	const parts = sizeStr.toLowerCase().split('x');
	const width = parseInt(parts[0], 10);
	const height = parseInt(parts[1], 10);
	if (Number.isNaN(width) || Number.isNaN(height)) return { width: 1024, height: 1024 };
	return { width, height };
}

function parsePalette(paletteText) {
	if (!paletteText) return [];
	// Accept comma/space/newline separated hex values
	const tokens = paletteText
		.split(/[\s,\n]+/)
		.map(t => t.trim())
		.filter(Boolean);
	return tokens.filter(t => /^#?[0-9a-fA-F]{6}$/.test(t)).map(t => (t.startsWith('#') ? t : '#' + t));
}

function hexToRgb(hex) {
	const clean = hex.replace('#', '');
	return {
		r: parseInt(clean.substring(0, 2), 16),
		g: parseInt(clean.substring(2, 4), 16),
		b: parseInt(clean.substring(4, 6), 16)
	};
}

async function createColorOverlay(width, height, colorHex, alpha = 0.12) {
	const { r, g, b } = hexToRgb(colorHex);
	return sharp({
		create: {
			width,
			height,
			channels: 4,
			background: { r, g, b, alpha }
		}
	}).png().toBuffer();
}

async function createPlaceholderImage(width, height, paletteColors) {
	const bg = paletteColors && paletteColors.length > 0 ? paletteColors[0] : '#cccccc';
	const { r, g, b } = hexToRgb(bg);
	const buffer = await sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r, g, b }
		}
	}).png().toBuffer();
	return buffer;
}

async function applyBranding(imageBuffer, width, height, paletteColors, maybeLogoPath) {
	let image = sharp(imageBuffer).resize(width, height, { fit: 'cover' });

	if (paletteColors && paletteColors.length > 0) {
		const overlay = await createColorOverlay(width, height, paletteColors[0], 0.12);
		image = image.composite([{ input: overlay, blend: 'over' }]);
	}

	if (maybeLogoPath) {
		try {
			const targetLogoWidth = Math.max(64, Math.round(width * 0.18));
			const logoBuffer = await sharp(maybeLogoPath)
				.resize({ width: targetLogoWidth, fit: 'inside', withoutEnlargement: true })
				.png()
				.toBuffer();
			const meta = await sharp(logoBuffer).metadata();
			const logoW = meta.width || Math.round(width * 0.18);
			const logoH = meta.height || Math.round(height * 0.18);
			const padding = Math.max(12, Math.round(Math.min(width, height) * 0.02));
			const left = Math.max(0, width - logoW - padding);
			const top = Math.max(0, height - logoH - padding);
			image = image.composite([{ input: logoBuffer, left, top }]);
		} catch (e) {
			// ignore logo overlay failure
		}
	}

	return image.png().toBuffer();
}

function buildBrandSummary({ brandName, palette, slogans, brandContext }) {
	const paletteList = parsePalette(palette);
	return `You are creating on-brand marketing content for the brand "${brandName || 'Unknown Brand'}".
Brand palette: ${paletteList.join(', ') || 'Not provided'}.
Brand slogans or taglines: ${slogans || 'Not provided'}.
Brand background and voice: ${brandContext || 'Not provided'}.
Ensure the tone, style, and visual choices are consistent with the brand.`;
}

async function generateCopyWithOpenAI(brandSummary, userContext) {
	if (!openai) {
		return {
			provider: 'openai',
			text: `[Mocked OpenAI copy] ${userContext}\n\n${brandSummary}`
		};
	}
	const prompt = `${brandSummary}\n\nTask: Write compelling marketing copy based on this request: "${userContext}". Return 1 strong option, 80-150 words, with a clear call to action.`;
	const completion = await openai.chat.completions.create({
		model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: 'You are an expert marketing copywriter focused on brand consistency and conversion.' },
			{ role: 'user', content: prompt }
		],
		temperature: 0.8,
		max_tokens: 300
	});
	return {
		provider: 'openai',
		text: completion.choices?.[0]?.message?.content?.trim() || ''
	};
}

async function generateCopyWithCohere(brandSummary, userContext) {
	if (!cohere) {
		return {
			provider: 'cohere',
			text: `[Mocked Cohere copy] ${userContext}\n\n${brandSummary}`
		};
	}
	const prompt = `${brandSummary}\n\nTask: Write compelling marketing copy based on this request: "${userContext}". Return 1 strong option, 80-150 words, with a clear call to action.`;
	const resp = await cohere.chat({
		model: process.env.COHERE_TEXT_MODEL || 'command-r',
		message: prompt,
		temperature: 0.8
	});
	return {
		provider: 'cohere',
		text: resp?.text?.trim?.() || resp?.message?.content?.[0]?.text || ''
	};
}

async function generateImageWithOpenAI(brandSummary, userContext, outWidth, outHeight) {
	if (!openai) {
		const placeholder = await createPlaceholderImage(outWidth, outHeight, parsePalette(''));
		return { provider: 'openai', imageBuffer: placeholder };
	}
	const safeSize = '1024x1024';
	const prompt = `${brandSummary}\n\nTask: Create a high-quality marketing visual that aligns with the brand based on this request: "${userContext}".`;
	const result = await openai.images.generate({
		model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
		prompt,
		size: safeSize,
		n: 1
	});
	const b64 = result.data?.[0]?.b64_json;
	const raw = b64 ? Buffer.from(b64, 'base64') : await createPlaceholderImage(1024, 1024, []);
	return { provider: 'openai', imageBuffer: raw };
}

async function generateImageWithStability(brandSummary, userContext, outWidth, outHeight) {
	if (!stabilityApiKey) {
		const placeholder = await createPlaceholderImage(outWidth, outHeight, parsePalette(''));
		return { provider: 'stability', imageBuffer: placeholder };
	}
	const engine = process.env.STABILITY_ENGINE || 'stable-diffusion-xl-1024-v1';
	const urlEndpoint = `https://api.stability.ai/v1/generation/${engine}/text-to-image`;
	const payload = {
		text_prompts: [{ text: `${brandSummary}\n\nTask: ${userContext}` }],
		cfg_scale: 7,
		clip_guidance_preset: 'FAST_BLUE',
		samples: 1,
		steps: 30,
		width: 1024,
		height: 1024
	};
	const resp = await fetch(urlEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${stabilityApiKey}`
		},
		body: JSON.stringify(payload)
	});
	if (!resp.ok) {
		const txt = await resp.text().catch(() => '');
		throw new Error(`Stability API error ${resp.status}: ${txt}`);
	}
	const data = await resp.json();
	const artifact = data?.artifacts?.[0];
	const b64 = artifact?.base64 || artifact?.image_base64 || artifact?.binary;
	const raw = b64 ? Buffer.from(b64, 'base64') : await createPlaceholderImage(1024, 1024, []);
	return { provider: 'stability', imageBuffer: raw };
}

app.post('/api/generate', upload.single('logo'), async (req, res) => {
	try {
		const { mode, size, brandName, palette, slogans, brandContext, userContext } = req.body;
		const { width, height } = parseSize(size);
		const paletteList = parsePalette(palette);
		const brandSummary = buildBrandSummary({ brandName, palette, slogans, brandContext });
		const logoPath = req.file ? req.file.path : null;

		if (mode === 'copy') {
			const [openaiCopy, cohereCopy] = await Promise.all([
				generateCopyWithOpenAI(brandSummary, userContext),
				generateCopyWithCohere(brandSummary, userContext)
			]);
			return res.json({
				mode: 'copy',
				results: [openaiCopy, cohereCopy]
			});
		}

		// default to image mode
		const [openaiImg, stabilityImg] = await Promise.all([
			generateImageWithOpenAI(brandSummary, userContext, width, height),
			generateImageWithStability(brandSummary, userContext, width, height)
		]);

		const finalOpenAI = await applyBranding(openaiImg.imageBuffer, width, height, paletteList, logoPath);
		const finalStability = await applyBranding(stabilityImg.imageBuffer, width, height, paletteList, logoPath);

		return res.json({
			mode: 'image',
			results: [
				{ provider: 'openai', mime: 'image/png', base64: finalOpenAI.toString('base64') },
				{ provider: 'stability', mime: 'image/png', base64: finalStability.toString('base64') }
			]
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({ error: err?.message || 'Unexpected error' });
	} finally {
		// Clean up uploaded logo file if present
		try {
			if (req.file && req.file.path && fs.existsSync(req.file.path)) {
				fs.unlinkSync(req.file.path);
			}
		} catch {}
	}
});

app.listen(port, () => {
	console.log(`Marketing Content Engine running at http://localhost:${port}`);
});