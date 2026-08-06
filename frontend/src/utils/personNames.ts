interface NamedPerson {
  name: string;
}

function surname(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? '';
}

export function comparePeopleBySurname(a: NamedPerson, b: NamedPerson): number {
  return surname(a.name).localeCompare(surname(b.name), undefined, { sensitivity: 'base' })
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}