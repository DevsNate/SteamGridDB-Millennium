// Older saved orders predate Collections. Preserve their order and insert it beside Manage.
export function withCollectionsTab(value: unknown): unknown {
  if (!Array.isArray(value) || value.includes('collections')) return value;
  const order = [...value];
  const manage = order.indexOf('manage');
  order.splice(manage < 0 ? order.length : manage + 1, 0, 'collections');
  return order;
}
