export function byId(id) {
  return document.getElementById(id);
}

export function bindIds(ids) {
  return ids.reduce((acc, id) => {
    acc[id] = byId(id);
    return acc;
  }, {});
}
