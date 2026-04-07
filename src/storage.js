const fs = require('fs/promises');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const XML_DIR = path.join(STORAGE_DIR, 'xml');
const INDEX_PATH = path.join(STORAGE_DIR, 'index.json');

async function ensureStorage() {
  await fs.mkdir(XML_DIR, { recursive: true });

  try {
    await fs.access(INDEX_PATH);
  } catch {
    await fs.writeFile(INDEX_PATH, JSON.stringify({ notes: [] }, null, 2), 'utf-8');
  }
}

async function readIndex() {
  await ensureStorage();
  const content = await fs.readFile(INDEX_PATH, 'utf-8');
  return JSON.parse(content);
}

async function writeIndex(indexData) {
  await fs.writeFile(INDEX_PATH, JSON.stringify(indexData, null, 2), 'utf-8');
}

async function addNote(note) {
  const indexData = await readIndex();
  indexData.notes.unshift(note);
  await writeIndex(indexData);
  return note;
}

async function listNotes(companyId, filters = {}) {
  const indexData = await readIndex();
  let result = indexData.notes.filter((item) => item.companyId === companyId);

  if (filters.notaName) {
    const notaName = String(filters.notaName).toLowerCase();
    result = result.filter((item) => (item.notaName || '').toLowerCase().includes(notaName));
  }

  if (filters.chave) {
    const chave = String(filters.chave).toLowerCase();
    result = result.filter((item) => (item.chave || '').toLowerCase().includes(chave));
  }

  if (filters.numero) {
    const numero = String(filters.numero).toLowerCase();
    result = result.filter((item) => String(item.numero || '').toLowerCase().includes(numero));
  }

  if (filters.cnpjEmitente) {
    const cnpj = String(filters.cnpjEmitente).toLowerCase();
    result = result.filter((item) => (item.cnpjEmitente || '').toLowerCase().includes(cnpj));
  }

  return result;
}

async function findNoteById(id, companyId) {
  const indexData = await readIndex();
  return indexData.notes.find((item) => item.id === id && item.companyId === companyId) || null;
}

async function removeNote(id, companyId) {
  const indexData = await readIndex();
  const note = indexData.notes.find((item) => item.id === id && item.companyId === companyId);

  if (!note) {
    return false;
  }

  indexData.notes = indexData.notes.filter(
    (item) => !(item.id === id && item.companyId === companyId)
  );
  await writeIndex(indexData);

  try {
    await fs.unlink(note.xmlPath);
  } catch {
    // File may already be removed, ignore to keep index consistency.
  }

  return true;
}

module.exports = {
  addNote,
  findNoteById,
  listNotes,
  removeNote,
  ensureStorage,
};
