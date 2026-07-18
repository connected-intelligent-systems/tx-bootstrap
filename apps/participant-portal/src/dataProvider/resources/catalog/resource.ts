import { CatalogConnectionService } from '../../../services/catalogConnectionService'

export async function getList() {
  const catalogs = await CatalogConnectionService.getCatalogs()
  return {
    data: catalogs,
    total: catalogs.length,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }
}

export async function getOne(params: { id: string }) {
  const catalog = await CatalogConnectionService.getCatalogById(params.id)
  if (!catalog) {
    throw new Error(`Catalog with id ${params.id} not found`)
  }
  return { data: catalog }
}
