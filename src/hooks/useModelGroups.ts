// ─── useModelGroups ───────────────────────────────────────────────────────────
// The scene's files, partitioned into the buildings they belong to.
//
// Three stores hold the evidence and none of them holds it all: `sceneStore`
// knows what is loaded, `validationStore` holds the spatial tree the identity
// comes out of, and `geoStore` holds the coordinates the fallback rung needs.
// This is the one place they are read together, so no component has to know
// that grouping has three inputs.
//
// The decision itself lives in `model-grouping` and is pure. This hook is
// wiring, deliberately: everything worth testing is on the other side of it.

import { useMemo } from 'react'
import { useSceneStore } from '../stores/sceneStore'
import { useValidationStore } from '../stores/validationStore'
import { useGeoStore } from '../stores/geoStore'
import {
  groupModels, identityFromTree,
  type ModelGroup, type ModelDescriptor,
} from '../lib/model-grouping'

export interface ModelGroups {
  groups: ModelGroup[]
  /** Group id for each model id, for a row that needs to know its own family. */
  groupIdOf: Record<string, string>
  /** True when anything is grouped — the UI can stay flat otherwise. */
  hasGroups: boolean
}

export function useModelGroups(): ModelGroups {
  const models = useSceneStore((s) => s.models)
  const spatialTrees = useValidationStore((s) => s.spatialTrees)
  const georefByModel = useGeoStore((s) => s.georefByModel)

  return useMemo(() => {
    const descriptors: ModelDescriptor[] = models.map((m) => {
      // A tree that has not been built yet answers nulls, and grouping falls to
      // a weaker rung until it arrives — then this memo re-runs and the tree
      // regroups itself. That is why identity is read here rather than frozen
      // into the model when it loads.
      const identity = identityFromTree(spatialTrees[m.id])
      const geo = georefByModel[m.id]
      return {
        id: m.id,
        fileName: m.fileName,
        projectGuid: identity.projectGuid,
        projectName: identity.projectName,
        siteName: identity.siteName,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        userGroupId: m.userGroupId ?? null,
      }
    })

    const groups = groupModels(descriptors)
    const groupIdOf: Record<string, string> = {}
    for (const g of groups) for (const id of g.memberIds) groupIdOf[id] = g.id

    return {
      groups,
      groupIdOf,
      // A scene of singletons is not "grouped", and showing a family header
      // over every single file would be noise pretending to be structure.
      hasGroups: groups.some((g) => g.memberIds.length > 1),
    }
  }, [models, spatialTrees, georefByModel])
}
