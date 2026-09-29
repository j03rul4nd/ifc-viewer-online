// ─── useModelGroups ───────────────────────────────────────────────────────────
// The scene's files and point clouds, partitioned into the buildings they
// belong to — as inferred, then as the user rearranged it.
//
// Several stores hold the evidence and none of them holds it all: `sceneStore`
// knows what is loaded, `validationStore` holds the spatial tree the identity
// comes out of, `geoStore` the coordinates the fallback rung needs,
// `pointCloudStore` the scans and `sceneGroupStore` the user's overrides. This
// is the one place they are read together, so no component has to know that
// grouping has five inputs.
//
// The decision itself lives in `model-grouping` + `scene-tree` and is pure.
// This hook is wiring, deliberately: everything worth testing is on the other
// side of it.

import { useMemo } from 'react'
import { useSceneStore } from '../stores/sceneStore'
import { useValidationStore } from '../stores/validationStore'
import { useGeoStore } from '../stores/geoStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useSceneGroupStore } from '../stores/sceneGroupStore'
import { identityFromTree } from '../lib/model-grouping'
import { buildSceneTree, type SceneModelDesc, type SceneTreeGroup } from '../lib/scene-tree'

export interface ModelGroups {
  groups: SceneTreeGroup[]
  /** Group id for each model id and each cloud id. */
  groupIdOf: Record<string, string>
  /** Clouds in no group. */
  looseCloudIds: string[]
  /** True when anything is grouped — the UI can stay flat otherwise. */
  hasGroups: boolean
}

/** The key a model's group assignment is stored under — stable across reloads. */
export const modelFileKey = (m: { fileName: string }): string => m.fileName

export function useModelGroups(): ModelGroups {
  const models = useSceneStore((s) => s.models)
  const spatialTrees = useValidationStore((s) => s.spatialTrees)
  const georefByModel = useGeoStore((s) => s.georefByModel)
  const clouds = usePointCloudStore((s) => s.clouds)
  const userGroups = useSceneGroupStore((s) => s.userGroups)
  const modelAssign = useSceneGroupStore((s) => s.modelAssign)
  const cloudAssign = useSceneGroupStore((s) => s.cloudAssign)

  return useMemo(() => {
    const descriptors: SceneModelDesc[] = models.map((m) => {
      // A tree that has not been built yet answers nulls, and grouping falls to
      // a weaker rung until it arrives — then this memo re-runs and the tree
      // regroups itself. That is why identity is read here rather than frozen
      // into the model when it loads.
      const identity = identityFromTree(spatialTrees[m.id])
      const geo = georefByModel[m.id]
      return {
        id: m.id,
        fileName: m.fileName,
        fileKey: modelFileKey(m),
        projectGuid: identity.projectGuid,
        projectName: identity.projectName,
        siteName: identity.siteName,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
      }
    })

    const tree = buildSceneTree({
      models: descriptors,
      clouds: clouds.map((c) => ({ id: c.id, fileKey: c.fileKey, alignedToModelId: c.alignedToModelId })),
      userGroups,
      modelAssign,
      cloudAssign,
    })

    return {
      ...tree,
      // A scene of singletons is not "grouped", and showing a family header
      // over every single file would be noise pretending to be structure. A
      // group the user made, or a cloud inside one, is structure.
      hasGroups: tree.groups.some((g) => g.user || g.memberIds.length + g.cloudIds.length > 1),
    }
  }, [models, spatialTrees, georefByModel, clouds, userGroups, modelAssign, cloudAssign])
}
