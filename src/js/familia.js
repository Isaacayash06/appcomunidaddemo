/**
 * familia.js — Gestión de vínculos familiares entre miembros
 * Storage: localStorage['kehila_family_links'] = { userId: [{id,name,initials,relation}] }
 */

const FAMILIA_KEY = 'kehila_family_links';

const RELACIONES_FAMILIA = [
  { value: 'conyuge',  label: 'Cónyuge' },
  { value: 'hijo',     label: 'Hijo/a' },
  { value: 'padre',    label: 'Padre / Madre' },
  { value: 'hermano',  label: 'Hermano/a' },
  { value: 'abuelo',   label: 'Abuelo/a' },
  { value: 'otro',     label: 'Otro familiar' },
];

function getFamilyLinks(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(FAMILIA_KEY) || '{}');
    return all[userId] || [];
  } catch (e) { return []; }
}

function _saveFamilyLinks(userId, links) {
  try {
    const all = JSON.parse(localStorage.getItem(FAMILIA_KEY) || '{}');
    all[userId] = links;
    localStorage.setItem(FAMILIA_KEY, JSON.stringify(all));
  } catch (e) {}
}

function addFamilyLink(userId, member, relation) {
  const links = getFamilyLinks(userId);
  if (links.find(l => l.id === member.id)) return false;
  links.push({ id: member.id, name: member.name, initials: member.initials, relation });
  _saveFamilyLinks(userId, links);
  return true;
}

function removeFamilyLink(userId, memberId) {
  const links = getFamilyLinks(userId).filter(l => l.id !== memberId);
  _saveFamilyLinks(userId, links);
}

async function searchMembers(query, excludeIds) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const session = typeof getValidSession === 'function' ? await getValidSession() : null;
  if (!session) return []; // sin sesión real: no se consulta profiles
  const { data, error } = await sb
    .from('profiles')
    .select('id, name, email, initials')
    .eq('status', 'active')
    .ilike('name', `%${q}%`)
    .limit(10);
  if (error || !data) return [];
  return data.filter(m => !excludeIds.includes(m.id)).slice(0, 6);
}
