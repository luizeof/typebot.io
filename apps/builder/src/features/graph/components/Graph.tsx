import { Fade, Flex, FlexProps, useEventListener } from '@chakra-ui/react'
import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import {
  BlockV6,
  GroupV6,
  PublicTypebotV6,
  TypebotV6,
} from '@typebot.io/schemas'
import { useDebounce } from 'use-debounce'
import GraphElements from './GraphElements'
import { createId } from '@paralleldrive/cuid2'
import { ZoomButtons } from './ZoomButtons'
import { useGesture } from '@use-gesture/react'
import { headerHeight } from '@/features/editor/constants'
import { graphPositionDefaultValue } from '../constants'
import { useBlockDnd } from '../providers/GraphDndProvider'
import { useGraph } from '../providers/GraphProvider'
import { Coordinates } from '../types'
import {
  TotalAnswers,
  TotalVisitedEdges,
} from '@typebot.io/schemas/features/analytics'
import { SelectBox } from './SelectBox'
import { computeSelectBoxDimensions } from '../helpers/computeSelectBoxDimensions'
import { GroupSelectionMenu } from './GroupSelectionMenu'
import { isSelectBoxIntersectingWithElement } from '../helpers/isSelectBoxIntersectingWithElement'
import { useGroupsStore } from '../hooks/useGroupsStore'
import { useShallow } from 'zustand/react/shallow'
import { projectMouse } from '../helpers/projectMouse'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUser } from '@/features/account/hooks/useUser'
import { graphGestureNotficationKey } from '@typebot.io/schemas/features/user/constants'
import { toast } from 'sonner'
import { LightBulbIcon } from '@/components/icons'

const maxScale = 2
const minScale = 0.3
const zoomButtonsScaleBlock = 0.2

export const Graph = ({
  typebot,
  totalAnswers,
  totalVisitedEdges,
  onUnlockProPlanClick,
  ...props
}: {
  typebot: TypebotV6 | PublicTypebotV6
  totalVisitedEdges?: TotalVisitedEdges[]
  totalAnswers?: TotalAnswers[]
  onUnlockProPlanClick?: () => void
} & FlexProps) => {
  const {
    draggedBlockType,
    setDraggedBlockType,
    draggedBlock,
    setDraggedBlock,
    draggedItem,
    setDraggedItem,
  } = useBlockDnd()
  const { pasteGroups, createGroup } = useTypebot()
  const { user, updateUser } = useUser()
  const {
    isReadOnly,
    setGraphPosition: setGlobalGraphPosition,
    setOpenedBlockId,
    setOpenedItemId,
    setPreviewingEdge,
    connectingIds,
  } = useGraph()
  const isDraggingGraph = useGroupsStore((state) => state.isDraggingGraph)
  const setIsDraggingGraph = useGroupsStore((state) => state.setIsDraggingGraph)
  const focusedGroups = useGroupsStore(
    useShallow((state) => state.focusedGroups)
  )
  const {
    setGroupsCoordinates,
    blurGroups,
    setFocusedGroups,
    updateGroupCoordinates,
  } = useGroupsStore(
    useShallow((state) => ({
      updateGroupCoordinates: state.updateGroupCoordinates,
      setGroupsCoordinates: state.setGroupsCoordinates,
      blurGroups: state.blurGroups,
      setFocusedGroups: state.setFocusedGroups,
    }))
  )
  const groupsInClipboard = useGroupsStore(
    useShallow((state) => state.groupsInClipboard)
  )

  const [graphPosition, setGraphPosition] = useState(
    graphPositionDefaultValue(
      typebot.events[0].graphCoordinates ?? { x: 0, y: 0 }
    )
  )
  const [autoMoveDirection, setAutoMoveDirection] = useState<
    'top' | 'right' | 'bottom' | 'left' | undefined
  >()
  const [selectBoxCoordinates, setSelectBoxCoordinates] = useState<
    | {
        origin: Coordinates
        dimension: {
          width: number
          height: number
        }
      }
    | undefined
  >()
  const [groupRects, setGroupRects] = useState<
    { groupId: string; rect: DOMRect }[] | undefined
  >()
  const [lastMouseClickPosition, setLastMouseClickPosition] = useState<
    Coordinates | undefined
  >()
  const [isDragging, setIsDragging] = useState(false)

  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)

  useAutoMoveBoard(autoMoveDirection, setGraphPosition)

  const [debouncedGraphPosition] = useDebounce(graphPosition, 200)
  const transform = useMemo(
    () =>
      `translate(${Number(graphPosition.x.toFixed(2))}px, ${Number(
        graphPosition.y.toFixed(2)
      )}px) scale(${graphPosition.scale})`,
    [graphPosition]
  )

  useEffect(() => {
    editorContainerRef.current = document.getElementById(
      'editor-container'
    ) as HTMLDivElement
  }, [])

  useEffect(() => {
    if (!graphContainerRef.current) return
    const { top, left } = graphContainerRef.current.getBoundingClientRect()
    setGlobalGraphPosition({
      x: left + debouncedGraphPosition.x,
      y: top + debouncedGraphPosition.y,
      scale: debouncedGraphPosition.scale,
    })
  }, [debouncedGraphPosition, setGlobalGraphPosition])

  useEffect(() => {
    setGroupsCoordinates(typebot.groups)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMouseUp = (e: MouseEvent) => {
    if (!typebot) return
    if (draggedItem) setDraggedItem(undefined)
    if (!draggedBlock && !draggedBlockType) return

    const coordinates = projectMouse(
      { x: e.clientX, y: e.clientY },
      graphPosition
    )
    const id = createId()
    updateGroupCoordinates(id, coordinates)
    createGroup({
      id,
      ...coordinates,
      block: draggedBlock ?? (draggedBlockType as BlockV6['type']),
      indices: { groupIndex: typebot.groups.length, blockIndex: 0 },
    })
    setDraggedBlock(undefined)
    setDraggedBlockType(undefined)
  }

  const handleCaptureMouseDown = (e: MouseEvent) => {
    const isRightClick = e.button === 2
    if (isRightClick) e.stopPropagation()
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (isDraggingGraph) return
    if (
      !selectBoxCoordinates ||
      Math.abs(selectBoxCoordinates?.dimension.width) +
        Math.abs(selectBoxCoordinates?.dimension.height) <
        5
    ) {
      blurGroups()
      setLastMouseClickPosition(
        projectMouse({ x: e.clientX, y: e.clientY }, graphPosition)
      )
    } else if (
      user &&
      !user?.displayedInAppNotifications?.[graphGestureNotficationKey]
    ) {
      toast.info('To move the graph using your mouse, hold the Space bar', {
        action: {
          label: 'More info',
          onClick: () => {
            window.open('https://docs.typebot.io/editor/graph', '_blank')
          },
        },
        duration: 30000,
        icon: <LightBulbIcon w="20px" h="20px" />,
      })
      updateUser({
        displayedInAppNotifications: {
          ...user.displayedInAppNotifications,
          [graphGestureNotficationKey]: true,
        },
      })
    }
    setSelectBoxCoordinates(undefined)
    setOpenedBlockId(undefined)
    setOpenedItemId(undefined)
    setPreviewingEdge(undefined)
  }

  useGesture(
    {
      onDrag: (props) => {
        if (isDraggingGraph) {
          if (props.first) setIsDragging(true)
          if (props.last) setIsDragging(false)
          setGraphPosition({
            ...graphPosition,
            x: graphPosition.x + props.delta[0],
            y: graphPosition.y + props.delta[1],
          })
          return
        }
        if (isReadOnly) return
        const currentGroupRects = props.first
          ? Array.from(document.querySelectorAll('.group')).map((element) => {
              return {
                groupId: element.id.split('-')[1],
                rect: element.getBoundingClientRect(),
              }
            })
          : groupRects
        if (props.first) setGroupRects(currentGroupRects)
        const dimensions = computeSelectBoxDimensions(props)
        setSelectBoxCoordinates(dimensions)
        const selectedGroups = currentGroupRects!.reduce<string[]>(
          (groups, element) => {
            if (isSelectBoxIntersectingWithElement(dimensions, element.rect)) {
              return [...groups, element.groupId]
            }
            return groups
          },
          []
        )
        if (selectedGroups.length > 0) setFocusedGroups(selectedGroups)
      },
      onWheel: ({ shiftKey, delta: [dx, dy], pinching }) => {
        if (pinching) return

        setGraphPosition({
          ...graphPosition,
          x: graphPosition.x - dx,
          y: shiftKey ? graphPosition.y : graphPosition.y - dy,
        })
      },
      onPinch: ({ origin: [x, y], offset: [scale] }) => {
        zoom({ scale, mousePosition: { x, y } })
      },
    },
    {
      target: graphContainerRef,
      pinch: {
        scaleBounds: { min: minScale, max: maxScale },
        modifierKey: 'ctrlKey',
      },
      drag: { pointer: { keys: false } },
    }
  )

  const getCenterOfGraph = (): Coordinates => {
    const graphWidth = graphContainerRef.current?.clientWidth ?? 0
    const graphHeight = graphContainerRef.current?.clientHeight ?? 0
    return {
      x: graphWidth / 2,
      y: graphHeight / 2,
    }
  }

  const zoom = ({
    scale,
    mousePosition,
    delta,
  }: {
    scale?: number
    delta?: number
    mousePosition?: Coordinates
  }) => {
    const { x: mouseX, y } = mousePosition ?? getCenterOfGraph()
    const mouseY = y - headerHeight
    let newScale = graphPosition.scale + (delta ?? 0)
    if (scale) {
      const scaleDiff = scale - graphPosition.scale
      newScale +=
        Math.min(zoomButtonsScaleBlock, Math.abs(scaleDiff)) *
        Math.sign(scaleDiff)
    }

    if (
      (newScale >= maxScale && graphPosition.scale === maxScale) ||
      (newScale <= minScale && graphPosition.scale === minScale)
    )
      return
    newScale =
      newScale >= maxScale
        ? maxScale
        : newScale <= minScale
        ? minScale
        : newScale

    const xs = (mouseX - graphPosition.x) / graphPosition.scale
    const ys = (mouseY - graphPosition.y) / graphPosition.scale
    setGraphPosition({
      ...graphPosition,
      x: mouseX - xs * newScale,
      y: mouseY - ys * newScale,
      scale: newScale,
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!connectingIds)
      return autoMoveDirection ? setAutoMoveDirection(undefined) : undefined
    if (e.clientX <= 50) return setAutoMoveDirection('left')
    if (e.clientY <= 50 + headerHeight) return setAutoMoveDirection('top')
    if (e.clientX >= window.innerWidth - 50)
      return setAutoMoveDirection('right')
    if (e.clientY >= window.innerHeight - 50)
      return setAutoMoveDirection('bottom')
    setAutoMoveDirection(undefined)
  }

  useKeyboardShortcuts({
    paste: () => {
      if (!groupsInClipboard || isReadOnly) return
      const { groups, oldToNewIdsMapping } = parseGroupsToPaste(
        groupsInClipboard.groups,
        lastMouseClickPosition ??
          projectMouse(
            {
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            },
            graphPosition
          )
      )
      groups.forEach((group) => {
        updateGroupCoordinates(group.id, group.graphCoordinates)
      })
      pasteGroups(groups, groupsInClipboard.edges, oldToNewIdsMapping)
      setFocusedGroups(groups.map((g) => g.id))
    },
  })

  useEventListener('keydown', (e) => {
    if (e.key === ' ') setIsDraggingGraph(true)
  })
  useEventListener('keyup', (e) => {
    if (e.key === ' ') {
      setIsDraggingGraph(false)
      setIsDragging(false)
    }
  })

  useEventListener('mousedown', handleCaptureMouseDown, undefined, {
    capture: true,
  })
  useEventListener('mouseup', handleMouseUp, graphContainerRef.current)
  useEventListener('pointerup', handlePointerUp, editorContainerRef.current)
  useEventListener('mousemove', handleMouseMove)

  // Make sure pinch doesn't interfere with native Safari zoom
  // More info: https://use-gesture.netlify.app/docs/gestures/
  useEventListener('gesturestart', (e) => e.preventDefault())
  useEventListener('gesturechange', (e) => e.preventDefault())

  const zoomIn = () => zoom({ delta: zoomButtonsScaleBlock })
  const zoomOut = () => zoom({ delta: -zoomButtonsScaleBlock })

  const cursor = isDraggingGraph ? (isDragging ? 'grabbing' : 'grab') : 'auto'

  return (
    <Flex
      ref={graphContainerRef}
      position="relative"
      style={{
        touchAction: 'none',
        cursor,
      }}
      {...props}
    >
      {!isReadOnly && (
        <>
          {selectBoxCoordinates && <SelectBox {...selectBoxCoordinates} />}
          <Fade in={!isReadOnly && focusedGroups.length > 1}>
            <GroupSelectionMenu
              focusedGroups={focusedGroups}
              blurGroups={blurGroups}
            />
          </Fade>
        </>
      )}

      <ZoomButtons onZoomInClick={zoomIn} onZoomOutClick={zoomOut} />
      <Flex
        flex="1"
        w="full"
        h="full"
        position="absolute"
        data-testid="graph"
        style={{
          transform,
          perspective: 1000,
          backfaceVisibility: 'hidden',
          transformStyle: 'preserve-3d',
        }}
        willChange="transform"
        transformOrigin="0px 0px 0px"
      >
        <GraphElements
          edges={typebot.edges}
          groups={typebot.groups}
          events={typebot.events}
          totalAnswers={totalAnswers}
          totalVisitedEdges={totalVisitedEdges}
          onUnlockProPlanClick={onUnlockProPlanClick}
        />
      </Flex>
    </Flex>
  )
}

const useAutoMoveBoard = (
  autoMoveDirection: 'top' | 'right' | 'bottom' | 'left' | undefined,
  setGraphPosition: React.Dispatch<
    React.SetStateAction<{
      x: number
      y: number
      scale: number
    }>
  >
) =>
  useEffect(() => {
    if (!autoMoveDirection) return
    const interval = setInterval(() => {
      setGraphPosition((prev) => ({
        ...prev,
        x:
          autoMoveDirection === 'right'
            ? prev.x - 5
            : autoMoveDirection === 'left'
            ? prev.x + 5
            : prev.x,
        y:
          autoMoveDirection === 'bottom'
            ? prev.y - 5
            : autoMoveDirection === 'top'
            ? prev.y + 5
            : prev.y,
      }))
    }, 5)

    return () => {
      clearInterval(interval)
    }
  }, [autoMoveDirection, setGraphPosition])

const parseGroupsToPaste = (
  groups: GroupV6[],
  mousePosition: Coordinates
): { groups: GroupV6[]; oldToNewIdsMapping: Map<string, string> } => {
  const farLeftGroup = groups.sort(
    (a, b) => a.graphCoordinates.x - b.graphCoordinates.x
  )[0]
  const farLeftGroupCoord = farLeftGroup.graphCoordinates

  const oldToNewIdsMapping = new Map<string, string>()
  const newGroups = groups.map((group) => {
    const newId = createId()
    oldToNewIdsMapping.set(group.id, newId)

    return {
      ...group,
      id: newId,
      graphCoordinates:
        group.id === farLeftGroup.id
          ? mousePosition
          : {
              x:
                mousePosition.x +
                group.graphCoordinates.x -
                farLeftGroupCoord.x,
              y:
                mousePosition.y +
                group.graphCoordinates.y -
                farLeftGroupCoord.y,
            },
    }
  })

  return {
    groups: newGroups,
    oldToNewIdsMapping,
  }
}
