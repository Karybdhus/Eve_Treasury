import type { ProjectRecord } from './source-records';
export function assetLocation(record: ProjectRecord, items: Map<string, ProjectRecord>) {
    const containers: {
        itemId: string;
        typeId: string;
    }[] = [], visited = new Set<string>();
    let location = String(record.data.location_id), isContainer = record.data.location_type === 'item', unknown = false;
    while (isContainer) {
        if (visited.has(location)) {
            unknown = true;
            break;
        }
        visited.add(location);
        const container = items.get(location);
        if (!container) {
            unknown = true;
            break;
        }
        containers.push({ itemId: location, typeId: String(container.data.type_id) });
        location = String(container.data.location_id);
        isContainer = container.data.location_type === 'item';
    }
    return { rootLocation: unknown ? null : location, containers, locationUnknown: unknown };
}
