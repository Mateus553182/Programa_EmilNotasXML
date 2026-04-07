const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

function firstDefined(...values) {
  return values.find((item) => item !== undefined && item !== null && item !== '');
}

function toObject(value) {
  if (Array.isArray(value)) {
    return value[0] || {};
  }
  return value || {};
}

function getValueByKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

  // Supports keys with namespace prefix, e.g. ns2:infNFe
  const prefixedKey = Object.keys(obj).find((item) => item.endsWith(`:${key}`));
  if (prefixedKey) return obj[prefixedKey];

  return undefined;
}

function findFirstNodeByName(node, targetKey) {
  if (!node || typeof node !== 'object') return null;

  const direct = getValueByKey(node, targetKey);
  if (direct !== undefined) {
    return toObject(direct);
  }

  const values = Array.isArray(node) ? node : Object.values(node);
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const found = findFirstNodeByName(value, targetKey);
    if (found) return found;
  }

  return null;
}

function parseNfeMetadata(xmlText) {
  const parsed = parser.parse(xmlText);

  const infNFe = findFirstNodeByName(parsed, 'infNFe');

  if (!infNFe) {
    throw new Error(
      'XML nao parece ser uma NFe valida (infNFe nao encontrado). Pode ser evento/cancelamento ou XML de outro documento fiscal.'
    );
  }

  const ide = toObject(getValueByKey(infNFe, 'ide'));
  const emit = toObject(getValueByKey(infNFe, 'emit'));
  const dest = toObject(getValueByKey(infNFe, 'dest'));
  const totalNode = toObject(getValueByKey(infNFe, 'total'));
  const total = toObject(getValueByKey(totalNode, 'ICMSTot'));

  const idAttr = firstDefined(infNFe.Id, infNFe.id, infNFe['@_Id'], '');
  const chave = idAttr.startsWith('NFe') ? idAttr.slice(3) : idAttr;

  return {
    chave,
    numero: ide.nNF || '',
    serie: ide.serie || '',
    emissao: firstDefined(ide.dhEmi, ide.dEmi, ''),
    cnpjEmitente: firstDefined(emit.CNPJ, emit.CPF, ''),
    razaoEmitente: emit.xNome || '',
    cnpjDestinatario: firstDefined(dest.CNPJ, dest.CPF, ''),
    razaoDestinatario: dest.xNome || '',
    valorTotal: total.vNF || '',
  };
}

module.exports = {
  parseNfeMetadata,
};
