const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { v4: uuidv4 } = require('uuid');

const {
  addNote,
  ensureStorage,
  findNoteById,
  listNotes,
  removeNote,
} = require('./storage');
const {
  ensureCompanies,
  loginCompany,
  getSessionFromToken,
  logoutSession,
} = require('./auth');
const { parseNfeMetadata } = require('./xml-parser');

const app = express();
const PORT = process.env.PORT || 3310;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function decodeXmlBuffer(buffer) {
  if (!buffer || !buffer.length) {
    return '';
  }

  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf-8');
  }

  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le');
  }

  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer);
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const tmp = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = tmp;
    }
    return swapped.toString('utf16le');
  }

  return buffer.toString('utf-8');
}

function normalizeXmlText(rawText) {
  let text = String(rawText || '').replace(/^\uFEFF/, '').trim();

  // Some sample files include malformed pseudo-comment lines like:
  // <-- Powered By WebDANFE -->
  text = text.replace(/<--[\s\S]*?-->/g, '').trim();

  // Remove any garbage before the first tag.
  const firstTagIndex = text.indexOf('<');
  if (firstTagIndex > 0) {
    text = text.slice(firstTagIndex);
  }

  return text;
}

function isLikelyXml(text) {
  const trimmed = String(text || '').trim();
  return trimmed.startsWith('<') && trimmed.includes('>');
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  const session = getSessionFromToken(token);

  if (!session) {
    return res.status(401).json({ message: 'Sessao invalida ou expirada.' });
  }

  req.auth = session;
  return next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const { companyCode, username, password } = req.body || {};

  if (!companyCode || !username || !password) {
    return res.status(400).json({ message: 'Informe codigo da empresa, usuario e senha.' });
  }

  const session = await loginCompany(companyCode, username, password);

  if (!session) {
    return res.status(401).json({ message: 'Credenciais invalidas.' });
  }

  return res.json({
    token: session.token,
    company: {
      id: session.companyId,
      code: session.companyCode,
      name: session.companyName,
    },
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    company: {
      id: req.auth.companyId,
      code: req.auth.companyCode,
      name: req.auth.companyName,
    },
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = getBearerToken(req);
  logoutSession(token);
  return res.status(204).send();
});

app.get('/api/notas', authMiddleware, async (req, res) => {
  const notes = await listNotes(req.auth.companyId, req.query);
  res.json(notes);
});

app.post('/api/notas', authMiddleware, upload.single('xml'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo XML nao enviado.' });
    }

    const fileName = req.file.originalname || '';
    const notaName = (req.body.notaName || '').trim();
    let xmlText = normalizeXmlText(decodeXmlBuffer(req.file.buffer));

    // Fallback: some text editors save XML in UTF-16 LE without explicit BOM.
    if (!isLikelyXml(xmlText)) {
      const fallback = normalizeXmlText(req.file.buffer.toString('utf16le'));
      if (isLikelyXml(fallback)) {
        xmlText = fallback;
      }
    }

    if (!isLikelyXml(xmlText)) {
      return res.status(400).json({
        message: 'Arquivo nao parece ser XML valido. Envie um arquivo contendo XML de NFe.',
      });
    }

    let metadata;
    let parseWarning = null;

    try {
      metadata = parseNfeMetadata(xmlText);
    } catch (error) {
      // In this project we prioritize storage over strict validation.
      // If metadata extraction fails, keep the XML and save basic record info.
      metadata = {
        chave: '',
        numero: '',
        serie: '',
        emissao: '',
        cnpjEmitente: '',
        razaoEmitente: '',
        cnpjDestinatario: '',
        razaoDestinatario: '',
        valorTotal: '',
      };
      parseWarning =
        error && error.message
          ? `XML salvo, mas sem leitura completa dos campos da NFe: ${error.message}`
          : 'XML salvo, mas sem leitura completa dos campos da NFe.';
    }

    const id = uuidv4();
    const xmlPath = path.join(__dirname, '..', 'storage', 'xml', `${id}.xml`);
    await fs.writeFile(xmlPath, req.file.buffer);

    const note = {
      id,
      companyId: req.auth.companyId,
      notaName,
      ...metadata,
      fileName,
      xmlPath,
      uploadedAt: new Date().toISOString(),
      parseWarning,
    };

    await addNote(note);

    return res.status(201).json(note);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Erro ao processar XML.' });
  }
});

app.get('/api/notas/:id/download', authMiddleware, async (req, res) => {
  const note = await findNoteById(req.params.id, req.auth.companyId);

  if (!note) {
    return res.status(404).json({ message: 'Nota nao encontrada.' });
  }

  return res.download(note.xmlPath, note.fileName || `${note.id}.xml`);
});

app.delete('/api/notas/:id', authMiddleware, async (req, res) => {
  const removed = await removeNote(req.params.id, req.auth.companyId);

  if (!removed) {
    return res.status(404).json({ message: 'Nota nao encontrada.' });
  }

  return res.status(204).send();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/acesso', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'acesso.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

Promise.all([ensureStorage(), ensureCompanies()])
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar armazenamento:', error);
    process.exit(1);
  });
