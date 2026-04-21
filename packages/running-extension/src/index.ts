// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module running-extension
 */

import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ILabShell, ILayoutRestorer } from '@jupyterlab/application';
import {
  Dialog,
  ICommandPalette,
  IMovableSectionRegistry
} from '@jupyterlab/apputils';
import type {
  ISectionPanelTarget,
  ISidebarWithSections
} from '@jupyterlab/apputils';
import {
  IRunningSessionManagers,
  IRunningSessionSidebar,
  RunningSessionManagers,
  RunningSessions,
  SearchableSessions
} from '@jupyterlab/running';
import { IRecentsManager } from '@jupyterlab/docmanager';
import { IStateDB } from '@jupyterlab/statedb';
import { ITranslator } from '@jupyterlab/translation';
import {
  CommandToolbarButton,
  launcherIcon,
  PanelWithToolbar,
  runningIcon,
  ToolbarButton,
  undoIcon
} from '@jupyterlab/ui-components';
import type {
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue
} from '@lumino/coreutils';
import type { AccordionLayout, AccordionPanel, Widget } from '@lumino/widgets';
import { addKernelRunningSessionManager } from './kernels';
import { addOpenTabsSessionManager } from './opentabs';
import { addRecentlyClosedSessionManager } from './recents';

/**
 * The command IDs used by the running plugin.
 */
export namespace CommandIDs {
  export const kernelNewConsole = 'running:kernel-new-console';
  export const kernelNewNotebook = 'running:kernel-new-notebook';
  export const kernelOpenSession = 'running:kernel-open-session';
  export const kernelShutDown = 'running:kernel-shut-down';
  export const kernelShutDownUnused = 'running:kernel-shut-down-unused';
  export const showPanel = 'running:show-panel';
  export const showModal = 'running:show-modal';
  export const moveSectionTo = 'running:move-section-to';
  export const moveSectionBack = 'running:move-section-back';
}

/**
 * The default running sessions extension.
 */
const plugin: JupyterFrontEndPlugin<IRunningSessionManagers> = {
  id: '@jupyterlab/running-extension:plugin',
  description: 'Provides the running session managers.',
  provides: IRunningSessionManagers,
  requires: [ITranslator],
  optional: [ILabShell],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    labShell: ILabShell | null
  ): IRunningSessionManagers => {
    const runningSessionManagers = new RunningSessionManagers();

    if (labShell) {
      addOpenTabsSessionManager(runningSessionManagers, translator, labShell);
    }
    void addKernelRunningSessionManager(
      runningSessionManagers,
      translator,
      app
    );

    return runningSessionManagers;
  }
};

/**
 * The plugin enabling the running sidebar.
 */
const sidebarPlugin: JupyterFrontEndPlugin<IRunningSessionSidebar> = {
  id: '@jupyterlab/running-extension:sidebar',
  description: 'Provides the running session sidebar.',
  provides: IRunningSessionSidebar,
  requires: [IRunningSessionManagers, ITranslator],
  optional: [ILayoutRestorer, IStateDB, IMovableSectionRegistry],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IRunningSessionManagers,
    translator: ITranslator,
    restorer: ILayoutRestorer | null,
    state: IStateDB | null,
    registry: IMovableSectionRegistry | null
  ): IRunningSessionSidebar => {
    const trans = translator.load('jupyterlab');
    const running = new RunningSessions(manager, translator, state);
    running.id = 'jp-running-sessions';
    running.title.caption = trans.__('Running Terminals and Kernels');
    running.title.icon = runningIcon;
    running.node.setAttribute('role', 'region');
    running.node.setAttribute(
      'aria-label',
      trans.__('Running Sessions section')
    );

    if (restorer) {
      restorer.add(running, 'running-sessions');
    }
    app.shell.add(running, 'left', { rank: 200, type: 'Sessions and Tabs' });

    app.commands.addCommand(CommandIDs.showPanel, {
      label: trans.__('Sessions and Tabs'),
      describedBy: {
        args: {
          type: 'object',
          properties: {}
        }
      },
      execute: () => {
        app.shell.activateById(running.id);
      }
    });

    if (registry) {
      registry.registerSource(
        '@jupyterlab/running-extension:running-sessions',
        trans.__('Running Sessions'),
        running
      );
    }

    return running;
  }
};

/**
 * An optional adding recently closed tabs.
 */
const recentsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/running-extension:recently-closed',
  description: 'Adds recently closed documents list.',
  requires: [IRunningSessionManagers, IRecentsManager, ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IRunningSessionManagers,
    recents: IRecentsManager,
    translator: ITranslator
  ): void => {
    addRecentlyClosedSessionManager(
      manager,
      recents,
      app.commands,
      app.docRegistry,
      translator
    );
  }
};

/**
 * An optional plugin allowing to search among running items.
 */
const searchPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/running-extension:search-tabs',
  description: 'Adds a widget to search open and closed tabs.',
  requires: [IRunningSessionManagers, ITranslator],
  optional: [ICommandPalette, IRunningSessionSidebar],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: IRunningSessionManagers,
    translator: ITranslator,
    palette: ICommandPalette | null,
    sidebar: IRunningSessionSidebar | null
  ): void => {
    const trans = translator.load('jupyterlab');

    app.commands.addCommand(CommandIDs.showModal, {
      execute: () => {
        const running = new SearchableSessions(manager, translator);
        const dialog = new Dialog({
          title: trans.__('Tabs and Running Sessions'),
          body: running,
          buttons: [Dialog.okButton({})],
          hasClose: true
        });
        dialog.addClass('jp-SearchableSessions-modal');
        return dialog.launch();
      },
      label: trans.__('Search Tabs and Running Sessions'),
      describedBy: {
        args: {
          type: 'object',
          properties: {}
        }
      }
    });
    if (palette) {
      palette.addItem({
        command: CommandIDs.showModal,
        category: trans.__('Running')
      });
    }
    if (sidebar) {
      const button = new CommandToolbarButton({
        commands: app.commands,
        id: CommandIDs.showModal,
        icon: launcherIcon,
        label: ''
      });
      sidebar.toolbar.addItem('open-as-modal', button);
    }
  }
};

/**
 * State DB key for persisting moved sections.
 */
const MOVE_STATE_KEY = 'section-mover:layout';

/**
 * Shape of the persisted state.
 * Keyed by target panel ID; each entry lists which sections live there and
 * the split-panel size ratios so they can be restored on reload.
 */
interface IMoveSectionsState {
  [targetId: string]: {
    sections: Array<{ sourceId: string; sectionId: string }>;
    panelSizes?: number[];
  };
}

/**
 * Generic plugin that moves sections between any registered source sidebar
 * and target panel. Sources and targets announce themselves via
 * IMovableSectionRegistry; this plugin discovers them through signals so no
 * code changes are needed when new participants register.
 */
const moveSectionsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/running-extension:move-sections',
  description:
    'Enables moving sections between any registered source and target sidebars.',
  requires: [ITranslator],
  optional: [IMovableSectionRegistry, IStateDB],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    registry: IMovableSectionRegistry | null,
    stateDB: IStateDB | null
  ): void => {
    if (!registry) {
      return;
    }

    const trans = translator.load('jupyterlab');

    // section title element (in source sidebar) → section identity
    const titleToSection = new WeakMap<
      HTMLElement,
      { sourceId: string; sectionId: string }
    >();

    // hosted widget → provenance info
    const widgetToInfo = new Map<
      Widget,
      {
        sourceId: string;
        sectionId: string;
        sourceLabel: string;
        targetId: string;
      }
    >();

    // hosted accordion title → widget (for context-menu lookup)
    const hostedTitleToWidget = new WeakMap<HTMLElement, Widget>();

    // per-widget move-back toolbar button, so we can dispose on move-back
    const widgetToMoveBackButton = new WeakMap<Widget, ToolbarButton>();

    // targets that already have drag-reorder set up
    const dragSetupDone = new Set<string>();

    // split panels we've connected handleMoved to (avoid duplicate connections)
    const connectedSplitPanels = new WeakSet<object>();

    // pending restorations: sourceId → Map<sectionId, targetId>
    const pendingSections = new Map<string, Map<string, string>>();
    // split sizes to apply once pending sections are resolved
    const pendingTargetSizes = new Map<string, number[]>();

    // Capture last right-clicked element before the context menu opens
    document.addEventListener(
      'contextmenu',
      (ev: MouseEvent) => {
        lastContextEl = ev.target as HTMLElement;
      },
      true
    );
    let lastContextEl: HTMLElement | null = null;

    // ------------------------------------------------------------------ //
    // Save / restore state                                                 //
    // ------------------------------------------------------------------ //

    const saveState = async (): Promise<void> => {
      if (!stateDB) {
        return;
      }
      const state: IMoveSectionsState = {};
      for (const [targetId, { panel }] of registry.getTargets()) {
        // Use panel.sections order to preserve accordion ordering
        const entries = panel.sections
          .map(w => widgetToInfo.get(w))
          .filter(
            (info): info is NonNullable<typeof info> =>
              !!info && info.targetId === targetId
          );
        if (entries.length === 0) {
          continue;
        }
        state[targetId] = {
          sections: entries.map(info => ({
            sourceId: info.sourceId,
            sectionId: info.sectionId
          }))
        };
        if (panel.splitPanel) {
          state[targetId].panelSizes = panel.splitPanel.relativeSizes();
        }
      }
      await stateDB.save(
        MOVE_STATE_KEY,
        state as unknown as ReadonlyPartialJSONValue
      );
    };

    // ------------------------------------------------------------------ //
    // Drag-to-reorder                                                      //
    // ------------------------------------------------------------------ //

    const addDragHandle = (widget: Widget, accordion: AccordionPanel): void => {
      const idx = Array.from(accordion.widgets).indexOf(widget);
      if (idx < 0) {
        return;
      }
      const titleEl = accordion.titles[idx];
      if (!titleEl.querySelector('.jp-FileBrowser-dragHandle')) {
        const handle = document.createElement('span');
        handle.className = 'jp-FileBrowser-dragHandle';
        titleEl.prepend(handle);
      }
    };

    const setupAccordionDrag = (
      accordion: AccordionPanel,
      targetId: string
    ): void => {
      if (dragSetupDone.has(targetId)) {
        return;
      }
      dragSetupDone.add(targetId);

      let draggedWidget: Widget | null = null;
      let startY = 0;
      let isDragging = false;

      const indicator = document.createElement('div');
      indicator.className = 'jp-FileBrowser-dropIndicator';
      indicator.style.display = 'none';
      accordion.node.appendChild(indicator);

      const getTargetSlot = (clientY: number): number => {
        const layout = accordion.layout as AccordionLayout;
        const titles = Array.from(layout.titles);
        for (let i = 0; i < titles.length; i++) {
          const rect = titles[i].getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) {
            return i;
          }
        }
        return titles.length;
      };

      const showIndicator = (targetSlot: number): void => {
        const layout = accordion.layout as AccordionLayout;
        const titles = Array.from(layout.titles);
        const panelRect = accordion.node.getBoundingClientRect();
        let top: number;
        if (targetSlot < titles.length) {
          top = titles[targetSlot].getBoundingClientRect().top - panelRect.top;
        } else {
          const last = titles[titles.length - 1].getBoundingClientRect();
          top = last.bottom - panelRect.top;
        }
        indicator.style.top = `${top}px`;
        indicator.style.display = 'block';
      };

      const endDrag = (clientY?: number): void => {
        indicator.style.display = 'none';
        accordion.node.classList.remove('jp-mod-dragging');
        if (isDragging && draggedWidget && clientY !== undefined) {
          const currentIdx = Array.from(accordion.widgets).indexOf(
            draggedWidget
          );
          const targetSlot = getTargetSlot(clientY);
          const insertIdx =
            targetSlot > currentIdx ? targetSlot - 1 : targetSlot;
          if (insertIdx !== currentIdx) {
            accordion.insertWidget(insertIdx, draggedWidget);
            void saveState();
          }
        }
        draggedWidget = null;
        isDragging = false;
      };

      accordion.node.addEventListener('pointerdown', (event: PointerEvent) => {
        const target = event.target as HTMLElement;
        const titleEl = target.closest(
          '.jp-AccordionPanel-title'
        ) as HTMLElement | null;
        if (!titleEl || !target.closest('.jp-FileBrowser-dragHandle')) {
          return;
        }
        const layout = accordion.layout as AccordionLayout;
        const idx = Array.from(layout.titles).indexOf(titleEl);
        if (idx < 0) {
          return;
        }
        draggedWidget = accordion.widgets[idx];
        startY = event.clientY;
        accordion.node.setPointerCapture(event.pointerId);
      });

      accordion.node.addEventListener('pointermove', (event: PointerEvent) => {
        if (!draggedWidget) {
          return;
        }
        if (!isDragging && Math.abs(event.clientY - startY) > 5) {
          isDragging = true;
          accordion.node.classList.add('jp-mod-dragging');
        }
        if (isDragging) {
          showIndicator(getTargetSlot(event.clientY));
        }
      });

      accordion.node.addEventListener('pointerup', (event: PointerEvent) => {
        endDrag(event.clientY);
      });

      accordion.node.addEventListener('pointercancel', () => {
        endDrag();
      });
    };

    // ------------------------------------------------------------------ //
    // Core move operations                                                 //
    // ------------------------------------------------------------------ //

    const applyMoveToTarget = (
      widget: Widget,
      sourceId: string,
      sectionId: string,
      sourceLabel: string,
      targetId: string,
      targetPanel: ISectionPanelTarget
    ): void => {
      const wasHidden = widget.isHidden;
      targetPanel.addSection(widget);

      widgetToInfo.set(widget, { sourceId, sectionId, sourceLabel, targetId });

      const accordion = targetPanel.accordionPanel;
      if (accordion) {
        if (!dragSetupDone.has(targetId)) {
          setupAccordionDrag(accordion, targetId);
        }
        addDragHandle(widget, accordion);

        const idx = Array.from(accordion.widgets).indexOf(widget);
        if (idx >= 0) {
          const hostedTitle = accordion.titles[idx];
          hostedTitle.classList.add('jp-hosted-section');
          hostedTitleToWidget.set(hostedTitle, widget);

          if (wasHidden) {
            hostedTitle.classList.remove('lm-mod-expanded');
            hostedTitle.setAttribute('aria-expanded', 'false');
          }
        }
      }

      if (widget instanceof PanelWithToolbar) {
        // Dispose existing button first (handles re-move scenarios)
        widgetToMoveBackButton.get(widget)?.dispose();
        const btn = new ToolbarButton({
          icon: undoIcon,
          tooltip: trans.__('Move back to %1', sourceLabel),
          onClick: () => {
            moveSectionBack(widget);
          }
        });
        widget.toolbar.addItem('move-back', btn);
        widgetToMoveBackButton.set(widget, btn);
      }

      const sp = targetPanel.splitPanel;
      if (sp && !connectedSplitPanels.has(sp)) {
        sp.handleMoved.connect(saveState);
        connectedSplitPanels.add(sp);
      }

      // Apply any pending split sizes for this target
      const sizes = pendingTargetSizes.get(targetId);
      if (sizes && targetPanel.splitPanel) {
        targetPanel.splitPanel.setRelativeSizes(sizes);
      }
    };

    /**
     * Move a section from its source sidebar to a target panel.
     * Returns true on success, false if the section is not yet available.
     */
    const moveSection = (
      sourceId: string,
      sectionId: string,
      targetId: string
    ): boolean => {
      const sourceEntry = registry.getSources().get(sourceId);
      const targetEntry = registry.getTargets().get(targetId);
      if (!sourceEntry || !targetEntry) {
        return false;
      }
      const widget = sourceEntry.sidebar.removeSection(sectionId);
      if (!widget) {
        return false;
      }
      applyMoveToTarget(
        widget,
        sourceId,
        sectionId,
        sourceEntry.label,
        targetId,
        targetEntry.panel
      );
      void saveState();
      return true;
    };

    const moveSectionBack = (widget: Widget): void => {
      const info = widgetToInfo.get(widget);
      if (!info) {
        return;
      }
      const sourceEntry = registry.getSources().get(info.sourceId);
      const targetEntry = registry.getTargets().get(info.targetId);
      if (!sourceEntry || !targetEntry) {
        return;
      }

      targetEntry.panel.removeSection(widget);
      sourceEntry.sidebar.reinsertSection(widget);

      widgetToInfo.delete(widget);

      widgetToMoveBackButton.get(widget)?.dispose();
      widgetToMoveBackButton.delete(widget);

      void saveState();
    };

    // ------------------------------------------------------------------ //
    // Source / target wiring                                               //
    // ------------------------------------------------------------------ //

    const setupSource = (
      sourceId: string,
      _sourceLabel: string,
      source: ISidebarWithSections
    ): void => {
      for (const section of source.getSections()) {
        section.titleNode.classList.add('jp-movable-section');
        titleToSection.set(section.titleNode, {
          sourceId,
          sectionId: section.id
        });
      }

      source.sectionAdded.connect((_sender, section) => {
        section.titleNode.classList.add('jp-movable-section');
        titleToSection.set(section.titleNode, {
          sourceId,
          sectionId: section.id
        });

        // Fulfill any pending state restoration for this section
        const pending = pendingSections.get(sourceId);
        if (pending?.has(section.id)) {
          const targetId = pending.get(section.id)!;
          pending.delete(section.id);
          if (pending.size === 0) {
            pendingSections.delete(sourceId);
          }
          moveSection(sourceId, section.id, targetId);
        }
      });
    };

    const setupTarget = (
      targetId: string,
      targetLabel: string,
      panel: ISectionPanelTarget
    ): void => {
      app.contextMenu.addItem({
        command: CommandIDs.moveSectionTo,
        args: { targetId, targetLabel },
        selector: '.jp-movable-section',
        rank: 10
      });

      if (panel.accordionPanel && panel.sections.length > 0) {
        setupAccordionDrag(panel.accordionPanel, targetId);
      }
    };

    // ------------------------------------------------------------------ //
    // Commands                                                             //
    // ------------------------------------------------------------------ //

    app.commands.addCommand(CommandIDs.moveSectionTo, {
      label: (args: ReadonlyPartialJSONObject) =>
        trans.__('Move to %1', (args.targetLabel as string) ?? ''),
      describedBy: {
        args: {
          type: 'object',
          properties: {
            targetId: { type: 'string' },
            targetLabel: { type: 'string' }
          }
        }
      },
      isVisible: () => {
        if (!lastContextEl) {
          return false;
        }
        const titleEl = lastContextEl.closest(
          '.jp-movable-section'
        ) as HTMLElement | null;
        return titleEl ? titleToSection.has(titleEl) : false;
      },
      execute: (args: ReadonlyPartialJSONObject) => {
        const targetId = args.targetId as string;
        if (!targetId || !lastContextEl) {
          return;
        }
        const titleEl = lastContextEl.closest(
          '.jp-movable-section'
        ) as HTMLElement | null;
        if (!titleEl) {
          return;
        }
        const sectionInfo = titleToSection.get(titleEl);
        if (!sectionInfo) {
          return;
        }
        moveSection(sectionInfo.sourceId, sectionInfo.sectionId, targetId);
      }
    });

    app.commands.addCommand(CommandIDs.moveSectionBack, {
      label: () => {
        if (!lastContextEl) {
          return trans.__('Move back');
        }
        const titleEl = lastContextEl.closest(
          '.jp-hosted-section'
        ) as HTMLElement | null;
        if (!titleEl) {
          return trans.__('Move back');
        }
        const widget = hostedTitleToWidget.get(titleEl);
        if (!widget) {
          return trans.__('Move back');
        }
        const info = widgetToInfo.get(widget);
        return info
          ? trans.__('Move back to %1', info.sourceLabel)
          : trans.__('Move back');
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {}
        }
      },
      isVisible: () => {
        if (!lastContextEl) {
          return false;
        }
        const titleEl = lastContextEl.closest(
          '.jp-hosted-section'
        ) as HTMLElement | null;
        return titleEl ? hostedTitleToWidget.has(titleEl) : false;
      },
      execute: () => {
        if (!lastContextEl) {
          return;
        }
        const titleEl = lastContextEl.closest(
          '.jp-hosted-section'
        ) as HTMLElement | null;
        if (!titleEl) {
          return;
        }
        const widget = hostedTitleToWidget.get(titleEl);
        if (widget) {
          moveSectionBack(widget);
        }
      }
    });

    app.contextMenu.addItem({
      command: CommandIDs.moveSectionBack,
      selector: '.jp-hosted-section',
      rank: 10
    });

    // ------------------------------------------------------------------ //
    // Bootstrap from registry                                              //
    // ------------------------------------------------------------------ //

    for (const [id, { label, sidebar }] of registry.getSources()) {
      setupSource(id, label, sidebar);
    }
    for (const [id, { label, panel }] of registry.getTargets()) {
      setupTarget(id, label, panel);
    }

    registry.sourcePanelRegistered.connect(
      (_sender, { id, label, sidebar }) => {
        setupSource(id, label, sidebar);
      }
    );
    registry.targetPanelRegistered.connect((_sender, { id, label, panel }) => {
      setupTarget(id, label, panel);
    });

    // ------------------------------------------------------------------ //
    // State restoration                                                    //
    // ------------------------------------------------------------------ //

    if (stateDB) {
      void stateDB.fetch(MOVE_STATE_KEY).then(value => {
        if (!value) {
          return;
        }
        const state = value as IMoveSectionsState;

        for (const [targetId, targetState] of Object.entries(state)) {
          for (const { sourceId, sectionId } of targetState.sections) {
            if (!moveSection(sourceId, sectionId, targetId)) {
              // Section not yet available — wait for sectionAdded signal
              if (!pendingSections.has(sourceId)) {
                pendingSections.set(sourceId, new Map());
              }
              pendingSections.get(sourceId)!.set(sectionId, targetId);
            }
          }

          if (targetState.panelSizes) {
            const targetEntry = registry.getTargets().get(targetId);
            if (targetEntry?.panel.splitPanel) {
              targetEntry.panel.splitPanel.setRelativeSizes(
                targetState.panelSizes
              );
            }
            // Also store for when pending sections arrive
            pendingTargetSizes.set(targetId, targetState.panelSizes);
          }
        }
      });
    }
  }
};

/**
 * Export the plugins.
 */
export default [
  plugin,
  sidebarPlugin,
  recentsPlugin,
  searchPlugin,
  moveSectionsPlugin
];
