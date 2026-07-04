"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, AlertTriangle, Archive, Bell, CalendarDays, Clock3, Coins, Database, FolderKanban, History, Inbox, Layers3, PanelRightOpen, Plus, RefreshCw, RotateCcw, Save, Sigma, Trash2, Workflow, X, Zap } from "lucide-react";
import { AiRunHistory } from "@/components/AiRunHistory";
import { AiSwitcher } from "@/components/AiSwitcher";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { AppShell, type AppView } from "@/components/AppShell";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { AutomationPanel } from "@/components/AutomationPanel";
import { ConnectorManagerPanel } from "@/components/ConnectorManagerPanel";
import { ContentCalendarPanel } from "@/components/ContentCalendarPanel";
import { GlobalSearch, type SearchEntry } from "@/components/GlobalSearch";
import { HandoffPanel } from "@/components/HandoffPanel";
import { InboxPanel } from "@/components/InboxPanel";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { ProjectMemoryPanel } from "@/components/ProjectMemoryPanel";
import { RulesPanel } from "@/components/RulesPanel";
import { TaskCard } from "@/components/TaskCard";
import {
  archiveProjectInDb,
  attemptDeleteContentInDb,
  createAutomationRuleInDb,
  createContentItemInDb,
  createInboxMessageInDb,
  createMediaAssetInDb,
  createProjectInDb,
  createTaskInDb,
  createTaskFromMessageInDb,
  deleteProjectInDb,
  draftReplyForMessageInDb,
  emptyControlCenterData,
  loadControlCenterData,
  mockPublishContentInDb,
  persistGeneratedHandoff,
  persistTaskTransition,
  requestReplyApprovalForMessageInDb,
  runAutomationRuleNowInDb,
  runContentAiActionInDb,
  updateAutomationRuleStatusInDb,
  updateMediaAssetStatusInDb,
  updateInboxMessageStatusInDb,
  updateProjectMemoryInDb,
  upsertConnectorInDb,
} from "@/lib/db/controlCenterRepository";
import { generateHandoffForTask, getModelLabel, startTaskWithAi } from "@/lib/orchestrator/taskRunner";
import type {
  ActionLog,
  AiModelId,
  Approval,
  AutomationStatus,
  ContentAiAction,
  ContentItem,
  ContentRoute,
  ControlCenterData,
  MediaAssetStatus,
  Message,
  MessageStatus,
  Project,
  ProjectMemory,
  PublishLog,
  Task,
  TaskState,
} from "@/lib/types";

type PendingProjectAction = {
  kind: "archive" | "restore" | "delete";
  projectId: string;
};

type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  created_at: string;
  tone: "sky" | "amber" | "emerald" | "violet";
  href: string;
  onSelect?: () => void;
};

type ApprovalToast = {
  id: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "error";
};

type ApproveApiResult = {
  task: Task;
  state: TaskState;
  approval: Approval;
  message?: Message;
  item?: ContentItem;
  routes?: ContentRoute[];
  publishLogs?: PublishLog[];
  log: ActionLog;
  error?: string;
};

const viewConfig: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Command overview" },
  projects: { title: "Projects", subtitle: "Workspaces and lifecycle" },
  tasks: { title: "Tasks", subtitle: "Stateful AI work queue" },
  inbox: { title: "Inbox", subtitle: "Unified message intake" },
  "ai-brain": { title: "AI Brain", subtitle: "Handoff and model control" },
  content: { title: "Content", subtitle: "Calendar and routing" },
  media: { title: "Media", subtitle: "Asset library and routing" },
  rules: { title: "Rules", subtitle: "Safe / review / blocked actions" },
  approvals: { title: "Approvals", subtitle: "Human review queue" },
  memory: { title: "Memory", subtitle: "Project brand context" },
  connectors: { title: "Connectors", subtitle: "Future integrations" },
  analytics: { title: "Analytics", subtitle: "Activity, cost, and volume" },
  automation: { title: "Automation", subtitle: "Mock workflows and routing" },
  settings: { title: "Settings", subtitle: "Application configuration" },
};

function newId(prefix: string) {
  const value = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  return `${prefix}-${value}`;
}

function formatTime(iso: string) {
  return iso.slice(11, 16);
}

function formatDateTime(iso?: string) {
  if (!iso) {
    return "Unscheduled";
  }

  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function sourceLabel(source: string) {
  return `${source.charAt(0).toUpperCase()}${source.slice(1)}`;
}

function notificationToneClass(tone: DashboardNotification["tone"]) {
  if (tone === "amber") {
    return "bg-amber-300";
  }

  if (tone === "emerald") {
    return "bg-emerald-300";
  }

  if (tone === "violet") {
    return "bg-violet-300";
  }

  return "bg-sky-300";
}

function approvalToastClass(tone: ApprovalToast["tone"]) {
  if (tone === "success") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-50";
  }

  if (tone === "error") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-50";
  }

  return "border-amber-300/40 bg-amber-300/10 text-amber-50";
}

function approvalToastCopy(status: string, executionError?: string): Omit<ApprovalToast, "id"> {
  if (status === "executed") {
    return {
      title: "Approved — executed successfully",
      detail: "Connector action completed and the approval data was refreshed from Supabase.",
      tone: "success",
    };
  }

  if (status === "failed") {
    return {
      title: "Approval failed",
      detail: executionError ?? "The connector action failed. Check the approval card for details.",
      tone: "error",
    };
  }

  return {
    title: "Approved — execution pending",
    detail: "Approved, but actual connector reply/send is not implemented yet.",
    tone: "warning",
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("row-level security")) {
    return "Supabase RLS is blocking writes. Run database/schema.sql in the Supabase SQL editor, then press Reload.";
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

function addLocalLog(projectId: string, taskId: string | undefined, actor: string, action: string, details: string): ActionLog {
  return {
    id: newId("log"),
    project_id: projectId,
    task_id: taskId,
    actor,
    action,
    details,
    created_at: new Date().toISOString(),
  };
}

export function ControlCenter({ view = "dashboard" }: { view?: AppView }) {
  const [data, setData] = useState<ControlCenterData>(() => emptyControlCenterData());
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedModel, setSelectedModel] = useState<AiModelId>("gemini");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskGoal, setNewTaskGoal] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [approvalToast, setApprovalToast] = useState<ApprovalToast | null>(null);
  const [pendingProjectAction, setPendingProjectAction] = useState<PendingProjectAction | null>(null);
  const [clockIso, setClockIso] = useState("2026-06-28T00:00:00.000Z");

  const showApprovalToast = useCallback((toast: Omit<ApprovalToast, "id">) => {
    setApprovalToast({ id: newId("approval-toast"), ...toast });
  }, []);

  const refreshDashboard = useCallback(async () => {
    setIsReady(false);
    setLoadError("");

    try {
      const loaded = await loadControlCenterData();

      setData(loaded);
      setSelectedTaskId((current) => {
        if (current && loaded.tasks.some((task) => task.id === current)) {
          return current;
        }

        return loaded.tasks[0]?.id ?? "";
      });
      setSelectedProjectId((current) => {
        const activeProjects = loaded.projects.filter((project) => project.status !== "archived");

        if (current && loaded.projects.some((project) => project.id === current)) {
          return current;
        }

        return activeProjects[0]?.id ?? loaded.projects[0]?.id ?? "";
      });
    } catch (error) {
      setData(emptyControlCenterData());
      setLoadError(getErrorMessage(error));
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refreshDashboard]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setClockIso(new Date().toISOString());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!approvalToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setApprovalToast(null);
    }, 6500);

    return () => window.clearTimeout(timeoutId);
  }, [approvalToast]);

  const selectedTask = useMemo(
    () => data.tasks.find((task) => task.id === selectedTaskId) ?? data.tasks[0],
    [data.tasks, selectedTaskId],
  );
  const selectedState = selectedTask ? data.task_states[selectedTask.id] : undefined;
  const selectedProject =
    data.projects.find((project) => project.id === selectedProjectId) ??
    (selectedTask ? data.projects.find((project) => project.id === selectedTask.project_id) : undefined);
  const selectedProjectMemory = selectedProject ? data.project_memory[selectedProject.id] : undefined;
  const selectedTaskMemory = selectedTask ? data.project_memory[selectedTask.project_id] : selectedProjectMemory;
  const selectedHandoff = selectedTask
    ? data.handoff_summaries.find((handoff) => handoff.task_id === selectedTask.id)
    : undefined;
  const selectedRuns = selectedTask ? data.ai_runs.filter((run) => run.task_id === selectedTask.id).slice(0, 8) : [];
  const selectedModelLabel = getModelLabel(selectedModel);
  const selectedLogs = selectedTask
    ? data.action_logs.filter((log) => log.task_id === selectedTask.id).slice(0, 8)
    : data.action_logs.slice(0, 8);
  const pendingApprovals = useMemo(
    () =>
      data.approvals.filter(
        (approval) =>
          approval.status === "pending" ||
          approval.execution_status === "executing" ||
          approval.execution_status === "execution_pending" ||
          approval.execution_status === "failed",
      ),
    [data.approvals],
  );
  const selectedProjectMessages = selectedProject ? data.messages.filter((message) => message.project_id === selectedProject.id) : [];
  const selectedProjectContentItems = selectedProject ? data.content_items.filter((item) => item.project_id === selectedProject.id) : [];
  const selectedProjectContentIds = new Set(selectedProjectContentItems.map((item) => item.id));
  const selectedProjectContentRoutes = data.content_routes.filter((route) => selectedProjectContentIds.has(route.content_item_id));
  const selectedProjectContentSchedule = data.content_schedule.filter((schedule) => selectedProjectContentIds.has(schedule.content_item_id));
  const selectedProjectPublishLogs = data.publish_logs.filter((log) => selectedProjectContentIds.has(log.content_item_id));
  const selectedProjectMediaAssets = selectedProject ? data.media_assets.filter((asset) => asset.project_id === selectedProject.id) : [];
  const selectedProjectConnectors = selectedProject ? data.connectors.filter((connector) => connector.project_id === selectedProject.id) : [];
  const selectedProjectWebsiteControlMap = selectedProject ? data.website_control_map.filter((entry) => entry.project_id === selectedProject.id) : [];
  const selectedProjectAutomationRules = selectedProject ? data.automation_rules.filter((rule) => rule.project_id === selectedProject.id) : [];
  const inboxUnreadCount = useMemo(() => data.messages.filter((message) => message.status === "unread").length, [data.messages]);
  const activeProjects = useMemo(() => data.projects.filter((project) => project.status !== "archived"), [data.projects]);
  const activeTasks = useMemo(() => data.tasks.filter((task) => task.status !== "completed"), [data.tasks]);
  const handoffCount = data.handoff_summaries.length;
  const totalCost = useMemo(() => data.ai_runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0), [data.ai_runs]);
  const totalTokens = useMemo(() => data.ai_runs.reduce((sum, run) => sum + (run.total_tokens ?? 0), 0), [data.ai_runs]);
  const canCreateTask = activeProjects.length > 0 && !isSaving;
  const pendingProject = pendingProjectAction
    ? data.projects.find((project) => project.id === pendingProjectAction.projectId)
    : undefined;
  const now = useMemo(() => new Date(clockIso), [clockIso]);
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  const projectById = useMemo(() => new Map(data.projects.map((project) => [project.id, project])), [data.projects]);
  const taskById = useMemo(() => new Map(data.tasks.map((task) => [task.id, task])), [data.tasks]);
  const projectName = useCallback(
    (projectId?: string) => (projectId ? projectById.get(projectId)?.name ?? "Unknown project" : "No project"),
    [projectById],
  );
  const contentItemsById = useMemo(() => new Map(data.content_items.map((item) => [item.id, item])), [data.content_items]);
  const scheduledContent = useMemo(() => data.content_schedule.filter((schedule) => schedule.status === "scheduled"), [data.content_schedule]);
  const scheduledContentCount = useMemo(() => {
    const scheduledContentIds = new Set(scheduledContent.map((schedule) => schedule.content_item_id));

    return (
      scheduledContentIds.size +
      data.content_items.filter((item) => item.status === "scheduled" && !scheduledContentIds.has(item.id)).length
    );
  }, [data.content_items, scheduledContent]);
  const aiCostToday = useMemo(
    () =>
      data.ai_runs
        .filter((run) => localDateKey(new Date(run.created_at)) === todayKey)
        .reduce((sum, run) => sum + (run.cost_usd ?? 0), 0),
    [data.ai_runs, todayKey],
  );
  const sortedSchedules = useMemo(
    () =>
      scheduledContent
        .filter((schedule) => schedule.scheduled_for)
        .slice()
        .sort((first, second) => String(first.scheduled_for).localeCompare(String(second.scheduled_for))),
    [scheduledContent],
  );
  const todaySchedule = useMemo(
    () => sortedSchedules.filter((schedule) => localDateKey(new Date(String(schedule.scheduled_for))) === todayKey).slice(0, 5),
    [sortedSchedules, todayKey],
  );
  const upcomingPosts = useMemo(
    () => sortedSchedules.filter((schedule) => new Date(String(schedule.scheduled_for)).getTime() >= now.getTime()).slice(0, 5),
    [now, sortedSchedules],
  );
  const dashboardNotifications = useMemo<DashboardNotification[]>(
    () =>
      [
        ...data.messages
          .filter((message) => message.status === "unread")
          .slice(0, 3)
          .map((message) => ({
            id: `message-${message.id}`,
            title: `New ${sourceLabel(message.source)} message received`,
            detail: message.subject || message.sender_name,
            created_at: message.received_at,
            tone: "sky" as const,
            href: "/inbox",
            onSelect: () => {
              setSelectedProjectId(message.project_id);
              if (message.linked_task_id) {
                setSelectedTaskId(message.linked_task_id);
              }
            },
          })),
        ...pendingApprovals.slice(0, 2).map((approval) => ({
          id: `approval-${approval.id}`,
          title: "Action needs review",
          detail: approval.reason,
          created_at: approval.created_at,
          tone: "amber" as const,
          href: "/approvals",
        })),
        ...sortedSchedules
          .filter((schedule) => localDateKey(new Date(String(schedule.scheduled_for))) === tomorrowKey)
          .slice(0, 2)
          .map((schedule) => ({
            id: `schedule-${schedule.id}`,
            title: "Post scheduled for tomorrow",
            detail: contentItemsById.get(schedule.content_item_id)?.title ?? "Scheduled content",
            created_at: schedule.scheduled_for ?? schedule.created_at,
            tone: "emerald" as const,
            href: "/content",
          })),
        ...data.handoff_summaries.slice(0, 2).map((handoff) => {
          const task = taskById.get(handoff.task_id);

          return {
            id: `handoff-${handoff.id}`,
            title: "AI handoff completed",
            detail: `${handoff.from_ai} to ${handoff.to_ai}`,
            created_at: handoff.created_at,
            tone: "violet" as const,
            href: "/ai-brain",
            onSelect: () => {
              if (task) {
                setSelectedTaskId(task.id);
                setSelectedProjectId(task.project_id);
              }
            },
          };
        }),
      ]
        .slice()
        .sort((first, second) => second.created_at.localeCompare(first.created_at))
        .slice(0, 6),
    [contentItemsById, data.handoff_summaries, data.messages, pendingApprovals, sortedSchedules, taskById, tomorrowKey],
  );
  const visibleNotifications = useMemo<DashboardNotification[]>(
    () =>
      dashboardNotifications.length > 0
        ? dashboardNotifications
        : [
            {
              id: "notifications-ready",
              title: "Notification center ready",
              detail: "Emails, comments, schedules, and handoffs will appear here.",
              created_at: now.toISOString(),
              tone: "emerald" as const,
              href: "/dashboard#notifications",
            },
          ],
    [dashboardNotifications, now],
  );
  const globalSearchEntries = useMemo<SearchEntry[]>(
    () => [
      ...data.projects.map((project) => ({
        id: `project-${project.id}`,
        type: "Project",
        title: project.name,
        detail: `${project.status} - ${project.description}`,
        href: "/projects",
        onSelect: () => setSelectedProjectId(project.id),
      })),
      ...data.tasks.map((task) => ({
        id: `task-${task.id}`,
        type: "Task",
        title: task.title,
        detail: `${projectName(task.project_id)} - ${task.status} - ${task.goal}`,
        href: "/tasks",
        onSelect: () => {
          setSelectedTaskId(task.id);
          setSelectedProjectId(task.project_id);
        },
      })),
      ...data.messages.map((message) => ({
        id: `message-${message.id}`,
        type: "Inbox",
        title: message.subject || message.sender_name,
        detail: `${projectName(message.project_id)} - ${message.source} - ${message.body}`,
        href: "/inbox",
        onSelect: () => {
          setSelectedProjectId(message.project_id);
          if (message.linked_task_id) {
            setSelectedTaskId(message.linked_task_id);
          }
        },
      })),
      ...data.content_items.map((item) => ({
        id: `content-${item.id}`,
        type: "Content",
        title: item.title,
        detail: `${projectName(item.project_id)} - ${item.content_type} - ${item.caption_body}`,
        href: "/content",
        onSelect: () => {
          setSelectedProjectId(item.project_id);
          if (item.task_id) {
            setSelectedTaskId(item.task_id);
          }
        },
      })),
      ...data.media_assets.map((asset) => ({
        id: `media-${asset.id}`,
        type: "Media",
        title: asset.title,
        detail: `${projectName(asset.project_id)} - ${asset.asset_type} - ${asset.tags.join(", ")}`,
        href: "/media",
        onSelect: () => setSelectedProjectId(asset.project_id),
      })),
      ...data.connectors.map((connector) => ({
        id: `connector-${connector.id}`,
        type: "Connector",
        title: connector.type,
        detail: `${projectName(connector.project_id)} - ${connector.status}`,
        href: "/connectors",
        onSelect: () => setSelectedProjectId(connector.project_id),
      })),
      ...data.automation_rules.map((rule) => ({
        id: `automation-${rule.id}`,
        type: "Automation",
        title: rule.name,
        detail: `${projectName(rule.project_id)} - ${rule.trigger} - ${rule.action}`,
        href: "/automation",
        onSelect: () => setSelectedProjectId(rule.project_id),
      })),
      ...data.ai_runs.map((run) => {
        const task = taskById.get(run.task_id);

        return {
          id: `run-${run.id}`,
          type: "AI",
          title: run.ai_model,
          detail: `${task?.title ?? "Task"} - ${run.output || run.input}`,
          href: "/ai-brain",
          onSelect: () => {
            if (task) {
              setSelectedTaskId(task.id);
              setSelectedProjectId(task.project_id);
            }
          },
        };
      }),
      ...data.action_logs.slice(0, 50).map((log) => ({
        id: `log-${log.id}`,
        type: "Log",
        title: log.action,
        detail: `${log.actor} - ${log.details}`,
        href: "/analytics",
        onSelect: () => {
          if (log.project_id) {
            setSelectedProjectId(log.project_id);
          }

          if (log.task_id) {
            setSelectedTaskId(log.task_id);
          }
        },
      })),
    ],
    [
      data.action_logs,
      data.ai_runs,
      data.automation_rules,
      data.connectors,
      data.content_items,
      data.media_assets,
      data.messages,
      data.projects,
      data.tasks,
      projectName,
      taskById,
    ],
  );

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();

    if (!name) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createProjectInDb({
        name,
        description: newProjectDescription.trim() || "AI-managed workspace",
      });

      setData((current) => ({
        ...current,
        projects: [result.project, ...current.projects],
        project_memory: {
          ...current.project_memory,
          [result.project.id]: result.memory,
        },
        action_logs: [result.log, ...current.action_logs],
      }));
      setSelectedProjectId(result.project.id);
      setNewProjectName("");
      setNewProjectDescription("");
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = newTaskGoal.trim();
    const projectId = activeProjects.find((project) => project.id === selectedProjectId)?.id ?? activeProjects[0]?.id;

    if (!goal || !projectId) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const title = newTaskTitle.trim() || goal.slice(0, 54) || "Untitled task";
      const result = await createTaskInDb({ projectId, title, goal });

      setData((current) => ({
        ...current,
        tasks: [result.task, ...current.tasks],
        task_states: {
          ...current.task_states,
          [result.task.id]: result.state,
        },
        action_logs: [result.log, ...current.action_logs],
      }));
      setSelectedProjectId(result.task.project_id);
      setSelectedTaskId(result.task.id);
      setNewTaskTitle("");
      setNewTaskGoal("");
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateInboxMessage(input: Parameters<typeof createInboxMessageInDb>[0]) {
    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createInboxMessageInDb(input);

      setData((current) => ({
        ...current,
        messages: [result.message, ...current.messages],
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateInboxMessageStatus(messageId: string, status: MessageStatus) {
    const message = data.messages.find((item) => item.id === messageId);

    if (!message) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await updateInboxMessageStatusInDb(message, status);

      setData((current) => ({
        ...current,
        messages: current.messages.map((item) => (item.id === messageId ? result.message : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateTaskFromMessage(messageId: string) {
    const message = data.messages.find((item) => item.id === messageId);

    if (!message) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createTaskFromMessageInDb(message);

      setData((current) => ({
        ...current,
        tasks: [result.task, ...current.tasks],
        task_states: {
          ...current.task_states,
          [result.task.id]: result.state,
        },
        messages: current.messages.map((item) => (item.id === messageId ? result.message : item)),
        action_logs: [...result.logs, ...current.action_logs],
      }));
      setSelectedProjectId(result.task.project_id);
      setSelectedTaskId(result.task.id);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDraftReplyForMessage(messageId: string) {
    const message = data.messages.find((item) => item.id === messageId);

    if (!message) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await draftReplyForMessageInDb(message);

      setData((current) => ({
        ...current,
        messages: current.messages.map((item) => (item.id === messageId ? result.message : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRequestReplyApproval(messageId: string) {
    const message = data.messages.find((item) => item.id === messageId);

    if (!message) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await requestReplyApprovalForMessageInDb(message);

      setData((current) => ({
        ...current,
        tasks: current.tasks.some((item) => item.id === result.task.id)
          ? current.tasks.map((item) => (item.id === result.task.id ? result.task : item))
          : [result.task, ...current.tasks],
        task_states: {
          ...current.task_states,
          [result.task.id]: result.state,
        },
        messages: current.messages.map((item) => (item.id === messageId ? result.message : item)),
        approvals: [result.approval, ...current.approvals],
        action_logs: [result.log, ...current.action_logs],
      }));
      setSelectedProjectId(result.task.project_id);
      setSelectedTaskId(result.task.id);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateContentItem(input: Omit<Parameters<typeof createContentItemInDb>[0], "rules">) {
    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createContentItemInDb({ ...input, rules: data.rules });

      setData((current) => ({
        ...current,
        content_items: [result.item, ...current.content_items],
        content_routes: [...result.routes, ...current.content_routes],
        content_schedule: result.schedule ? [result.schedule, ...current.content_schedule] : current.content_schedule,
        tasks: result.task ? [result.task, ...current.tasks] : current.tasks,
        task_states: result.task && result.state
          ? {
              ...current.task_states,
              [result.task.id]: result.state,
            }
          : current.task_states,
        approvals: result.approval ? [result.approval, ...current.approvals] : current.approvals,
        action_logs: [result.log, ...(result.approvalLog ? [result.approvalLog] : []), ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleContentAiAction(itemId: string, action: ContentAiAction) {
    const item = data.content_items.find((contentItem) => contentItem.id === itemId);

    if (!item) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await runContentAiActionInDb({
        item,
        action,
        memory: data.project_memory[item.project_id],
        rules: data.rules,
      });

      setData((current) => ({
        ...current,
        content_items: current.content_items.map((contentItem) => (contentItem.id === itemId ? result.item : contentItem)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMockPublishContent(itemId: string) {
    const item = data.content_items.find((contentItem) => contentItem.id === itemId);

    if (!item) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await mockPublishContentInDb({
        item,
        routes: data.content_routes.filter((route) => route.content_item_id === itemId),
        rules: data.rules,
      });
      const routeMap = new Map(result.routes.map((route) => [route.id, route]));

      setData((current) => ({
        ...current,
        content_items: current.content_items.map((contentItem) => (contentItem.id === itemId ? result.item : contentItem)),
        content_routes: current.content_routes.map((route) => routeMap.get(route.id) ?? route),
        content_schedule: current.content_schedule.map((schedule) =>
          schedule.content_item_id === itemId ? { ...schedule, status: result.item.status, updated_at: result.item.updated_at } : schedule,
        ),
        publish_logs: [...result.publishLogs, ...current.publish_logs],
        tasks: result.task
          ? current.tasks.some((task) => task.id === result.task?.id)
            ? current.tasks.map((task) => (task.id === result.task?.id ? result.task : task))
            : [result.task, ...current.tasks]
          : current.tasks,
        task_states: result.task && result.state
          ? {
              ...current.task_states,
              [result.task.id]: result.state,
            }
          : current.task_states,
        approvals: result.approval ? [result.approval, ...current.approvals] : current.approvals,
        action_logs: [result.log, ...(result.approvalLog ? [result.approvalLog] : []), ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBlockedContentDelete(itemId: string) {
    const item = data.content_items.find((contentItem) => contentItem.id === itemId);

    if (!item) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await attemptDeleteContentInDb({ item, rules: data.rules });

      setData((current) => ({
        ...current,
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateMediaAsset(input: Parameters<typeof createMediaAssetInDb>[0]) {
    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createMediaAssetInDb(input);

      setData((current) => ({
        ...current,
        media_assets: [result.asset, ...current.media_assets],
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateMediaAssetStatus(assetId: string, status: MediaAssetStatus) {
    const asset = data.media_assets.find((item) => item.id === assetId);

    if (!asset) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await updateMediaAssetStatusInDb(asset, status);

      setData((current) => ({
        ...current,
        media_assets: current.media_assets.map((item) => (item.id === assetId ? result.asset : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveConnector(input: Parameters<typeof upsertConnectorInDb>[0]) {
    setIsSaving(true);
    setLoadError("");

    try {
      const result = await upsertConnectorInDb(input);

      setData((current) => {
        const existing = current.connectors.some((connector) => connector.id === result.connector.id);

        return {
          ...current,
          connectors: existing
            ? current.connectors.map((connector) => (connector.id === result.connector.id ? result.connector : connector))
            : [result.connector, ...current.connectors],
          action_logs: [result.log, ...current.action_logs],
        };
      });
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAutomationRule(input: Parameters<typeof createAutomationRuleInDb>[0]) {
    setIsSaving(true);
    setLoadError("");

    try {
      const result = await createAutomationRuleInDb(input);

      setData((current) => ({
        ...current,
        automation_rules: [result.rule, ...current.automation_rules],
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateAutomationStatus(ruleId: string, status: AutomationStatus) {
    const rule = data.automation_rules.find((item) => item.id === ruleId);

    if (!rule) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await updateAutomationRuleStatusInDb(rule, status);

      setData((current) => ({
        ...current,
        automation_rules: current.automation_rules.map((item) => (item.id === ruleId ? result.rule : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunAutomationRule(ruleId: string) {
    const rule = data.automation_rules.find((item) => item.id === ruleId);

    if (!rule) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = await runAutomationRuleNowInDb(rule);

      setData((current) => ({
        ...current,
        automation_rules: current.automation_rules.map((item) => (item.id === ruleId ? result.rule : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStartTask(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    const state = data.task_states[taskId];

    if (!task || !state || state.status !== "queued") {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = startTaskWithAi({ task, state, projectId: task.project_id, modelId: "gpt" });
      const persisted = await persistTaskTransition({
        task,
        state: result.state,
        run: result.run,
        log: result.log,
      });

      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === taskId ? persisted.task : item)),
        task_states: {
          ...current.task_states,
          [taskId]: persisted.state,
        },
        ai_runs: [persisted.run ?? result.run, ...current.ai_runs],
        action_logs: [persisted.log, ...current.action_logs],
      }));
      setSelectedTaskId(taskId);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateHandoff() {
    const task = selectedTask;
    const state = selectedState;

    if (!task || !state) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const result = generateHandoffForTask({
        task,
        state,
        projectId: task.project_id,
        modelId: selectedModel,
        logs: data.action_logs,
        memory: selectedTaskMemory,
        rules: data.rules,
      });
      const persisted = await persistGeneratedHandoff({
        task,
        state,
        handoff: result.handoff,
        log: result.log,
      });

      setData((current) => ({
        ...current,
        task_states: {
          ...current.task_states,
          [task.id]: persisted.state,
        },
        handoff_summaries: [persisted.handoff, ...current.handoff_summaries],
        action_logs: [persisted.log, ...current.action_logs],
      }));
      setSelectedTaskId(task.id);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }
  async function handleContinueTask(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    const state = data.task_states[taskId];
    const handoff = data.handoff_summaries.find((item) => item.task_id === taskId);

    if (!task || !state || state.status !== "in_progress") {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const response = await fetch("/api/ai/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          state,
          handoff,
          modelId: selectedModel,
          logs: data.action_logs,
          memory: data.project_memory[task.project_id],
          rules: data.rules,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "AI continuation failed.");
      }

      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === taskId ? result.task : item)),
        task_states: {
          ...current.task_states,
          [taskId]: result.state,
        },
        ai_runs: result.run ? [result.run, ...current.ai_runs] : current.ai_runs,
        handoff_summaries: result.handoff ? [result.handoff, ...current.handoff_summaries] : current.handoff_summaries,
        approvals: result.approval ? [result.approval, ...current.approvals] : current.approvals,
        action_logs: result.log ? [result.log, ...current.action_logs] : current.action_logs,
      }));
      setSelectedTaskId(taskId);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApprove(approvalId: string) {
    const approval = data.approvals.find((item) => item.id === approvalId);

    if (!approval) {
      return;
    }

    const task = data.tasks.find((item) => item.id === approval.task_id);

    if (!task) {
      return;
    }

    setIsSaving(true);
    setLoadError("");

    try {
      const response = await fetch("/api/approvals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
      });
      const result = (await response.json()) as ApproveApiResult;

      if (!response.ok) {
        throw new Error(result.error ?? "Approval execution failed.");
      }

      const routeMap = new Map((result.routes ?? []).map((route) => [route.id, route]));

      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === task.id ? result.task : item)),
        task_states: {
          ...current.task_states,
          [task.id]: result.state,
        },
        approvals: current.approvals.map((item) => (item.id === approvalId ? result.approval : item)),
        messages: result.message
          ? current.messages.map((item) => (item.id === result.message?.id ? result.message : item))
          : current.messages,
        content_items: result.item
          ? current.content_items.map((item) => (item.id === result.item?.id ? result.item : item))
          : current.content_items,
        content_routes: routeMap.size > 0
          ? current.content_routes.map((route) => routeMap.get(route.id) ?? route)
          : current.content_routes,
        content_schedule: result.item
          ? current.content_schedule.map((schedule) =>
              schedule.content_item_id === result.item?.id
                ? { ...schedule, status: result.item.status, updated_at: result.item.updated_at }
                : schedule,
            )
          : current.content_schedule,
        publish_logs: result.publishLogs ? [...result.publishLogs, ...current.publish_logs] : current.publish_logs,
        action_logs: [result.log, ...current.action_logs],
      }));

      try {
        const refreshed = await loadControlCenterData();

        setData(refreshed);

        if (refreshed.tasks.some((item) => item.id === task.id)) {
          setSelectedTaskId(task.id);
        }

        if (refreshed.projects.some((item) => item.id === task.project_id)) {
          setSelectedProjectId(task.project_id);
        }
      } catch (refreshError) {
        setLoadError(`Approved, but refresh failed: ${getErrorMessage(refreshError)}`);
      }

      showApprovalToast(approvalToastCopy(result.approval.execution_status, result.approval.execution_error));
    } catch (error) {
      const message = getErrorMessage(error);

      setLoadError(message);
      showApprovalToast({
        title: "Approval failed",
        detail: message,
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveProjectMemory(memory: ProjectMemory) {
    setIsSaving(true);
    setLoadError("");

    try {
      const savedMemory = await updateProjectMemoryInDb(memory);

      setData((current) => ({
        ...current,
        project_memory: {
          ...current.project_memory,
          [savedMemory.project_id]: savedMemory,
        },
        action_logs: [
          addLocalLog(savedMemory.project_id, undefined, "User", "project_memory.updated", `Updated brand voice: ${savedMemory.brand_tone}.`),
          ...current.action_logs,
        ],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleArchiveProject(projectId: string, archived: boolean) {
    const project = data.projects.find((item) => item.id === projectId);

    if (!project) {
      return;
    }

    setPendingProjectAction({ kind: archived ? "archive" : "restore", projectId });
  }

  function handleDeleteProject(projectId: string) {
    const project = data.projects.find((item) => item.id === projectId);

    if (!project) {
      return;
    }

    setPendingProjectAction({ kind: "delete", projectId });
  }

  async function confirmProjectAction() {
    const action = pendingProjectAction;
    const project = action ? data.projects.find((item) => item.id === action.projectId) : undefined;

    if (!action || !project) {
      setPendingProjectAction(null);
      return;
    }

    if (action.kind === "delete") {
      await confirmDeleteProject(project);
      return;
    }

    await confirmArchiveProject(project, action.kind === "archive");
  }

  async function confirmArchiveProject(project: Project, archived: boolean) {
    const projectId = project.id;

    setIsSaving(true);
    setLoadError("");
    setPendingProjectAction(null);

    try {
      const result = await archiveProjectInDb(project, archived);

      setData((current) => ({
        ...current,
        projects: current.projects.map((item) => (item.id === projectId ? result.project : item)),
        action_logs: [result.log, ...current.action_logs],
      }));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteProject(project: Project) {
    const projectId = project.id;
    setIsSaving(true);
    setLoadError("");
    setPendingProjectAction(null);

    try {
      await deleteProjectInDb(project);
      const replacementProjectId = data.projects.find((item) => item.id !== projectId)?.id ?? "";
      const replacementTaskId = data.tasks.find((task) => task.project_id !== projectId)?.id ?? "";

      setData((current) => {
        const removedTaskIds = new Set(current.tasks.filter((task) => task.project_id === projectId).map((task) => task.id));
        const removedContentItemIds = new Set(current.content_items.filter((item) => item.project_id === projectId).map((item) => item.id));
        const nextStates = { ...current.task_states };

        for (const taskId of removedTaskIds) {
          delete nextStates[taskId];
        }

        const nextProjects = current.projects.filter((item) => item.id !== projectId);
        const nextMemory = { ...current.project_memory };
        delete nextMemory[projectId];

        return {
          ...current,
          projects: nextProjects,
          project_memory: nextMemory,
          tasks: current.tasks.filter((task) => task.project_id !== projectId),
          task_states: nextStates,
          ai_runs: current.ai_runs.filter((run) => !removedTaskIds.has(run.task_id)),
          handoff_summaries: current.handoff_summaries.filter((handoff) => !removedTaskIds.has(handoff.task_id)),
          approvals: current.approvals.filter((approval) => !removedTaskIds.has(approval.task_id)),
          connectors: current.connectors.filter((connector) => connector.project_id !== projectId),
          automation_rules: current.automation_rules.filter((rule) => rule.project_id !== projectId),
          messages: current.messages.filter((message) => message.project_id !== projectId),
          content_items: current.content_items.filter((item) => item.project_id !== projectId),
          content_routes: current.content_routes.filter((route) => !removedContentItemIds.has(route.content_item_id)),
          content_schedule: current.content_schedule.filter((schedule) => !removedContentItemIds.has(schedule.content_item_id)),
          publish_logs: current.publish_logs.filter((log) => log.project_id !== projectId && !removedContentItemIds.has(log.content_item_id)),
          media_assets: current.media_assets.filter((asset) => asset.project_id !== projectId),
          action_logs: current.action_logs.filter((log) => log.project_id !== projectId && (!log.task_id || !removedTaskIds.has(log.task_id))),
        };
      });
      setSelectedProjectId((current) => (current === projectId ? replacementProjectId : current));
      setSelectedTaskId((current) => {
        const deleted = data.tasks.some((task) => task.id === current && task.project_id === projectId);
        return deleted ? replacementTaskId : current;
      });
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  const currentView = viewConfig[view] ?? viewConfig.dashboard;
  const recentLogs = useMemo(() => data.action_logs.slice(0, 8), [data.action_logs]);
  const recentAiRuns = useMemo(() => data.ai_runs.slice(0, 6), [data.ai_runs]);

  const projectActionDialog = pendingProjectAction && pendingProject ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 px-4">
      <section
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-5 shadow-2xl shadow-black/40"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-300/10 text-amber-200">
            {pendingProjectAction.kind === "delete" ? (
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            ) : pendingProjectAction.kind === "archive" ? (
              <Archive className="h-5 w-5" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-zinc-50">
              {pendingProjectAction.kind === "delete"
                ? "Delete project?"
                : pendingProjectAction.kind === "archive"
                  ? "Archive project?"
                  : "Restore project?"}
            </h2>
            <p className="mt-2 break-words text-sm leading-6 text-zinc-400">
              {pendingProjectAction.kind === "delete"
                ? `This will delete ${pendingProject.name} and all linked tasks from Supabase.`
                : `${pendingProjectAction.kind === "archive" ? "Archive" : "Restore"} ${pendingProject.name}.`}
            </p>
            {pendingProjectAction.kind === "delete" ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Deletion cannot be undone.</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setPendingProjectAction(null)}
            disabled={isSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmProjectAction()}
            disabled={isSaving}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              pendingProjectAction.kind === "delete"
                ? "bg-rose-400 text-zinc-950 hover:bg-rose-300"
                : "bg-amber-300 text-zinc-950 hover:bg-amber-200"
            }`}
          >
            {pendingProjectAction.kind === "delete" ? (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            ) : pendingProjectAction.kind === "archive" ? (
              <Archive className="h-4 w-4" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {pendingProjectAction.kind === "delete"
              ? "Delete Project"
              : pendingProjectAction.kind === "archive"
                ? "Archive Project"
                : "Restore Project"}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const databaseAlert = loadError ? (
    <section className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100" aria-live="polite">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">Supabase is connected, but the database is not ready.</p>
          <p className="mt-1 break-words">{loadError}</p>
          <p className="mt-2 text-amber-100/80">Run <span className="font-mono">database/schema.sql</span> in Supabase SQL editor, then press Reload.</p>
        </div>
      </div>
    </section>
  ) : null;
  const loadingAlert =
    !isReady && !loadError ? (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-400" role="status" aria-live="polite">
        Loading Supabase workspace data...
      </section>
    ) : null;

  const projectForm = (
    <form onSubmit={handleCreateProject} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-50">New Project</h2>
        <Plus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
      </div>
      <label className="block text-sm text-zinc-400" htmlFor="project-name-view">Name</label>
      <input
        id="project-name-view"
        value={newProjectName}
        onChange={(event) => setNewProjectName(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
        placeholder="Project name"
      />
      <label className="mt-4 block text-sm text-zinc-400" htmlFor="project-description-view">Description</label>
      <textarea
        id="project-description-view"
        value={newProjectDescription}
        onChange={(event) => setNewProjectDescription(event.target.value)}
        className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
        placeholder="Workspace description"
      />
      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create Project
      </button>
    </form>
  );

  const taskForm = (
    <form onSubmit={handleCreateTask} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-50">New Task</h2>
        <Plus className="h-4 w-4 text-sky-300" aria-hidden="true" />
      </div>
      <label className="block text-sm text-zinc-400" htmlFor="task-project-view">Project</label>
      <select
        id="task-project-view"
        value={selectedProjectId}
        disabled={activeProjects.length === 0}
        onChange={(event) => setSelectedProjectId(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300 disabled:opacity-50"
      >
        {activeProjects.length === 0 ? <option value="">Create an active project first</option> : null}
        {activeProjects.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
      <label className="mt-4 block text-sm text-zinc-400" htmlFor="task-title-view">Title</label>
      <input
        id="task-title-view"
        value={newTaskTitle}
        onChange={(event) => setNewTaskTitle(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
        placeholder="Short title"
      />
      <label className="mt-4 block text-sm text-zinc-400" htmlFor="task-goal-view">Goal</label>
      <textarea
        id="task-goal-view"
        value={newTaskGoal}
        onChange={(event) => setNewTaskGoal(event.target.value)}
        className="mt-2 min-h-28 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
        placeholder="What should AI complete?"
      />
      <button
        type="submit"
        disabled={!canCreateTask}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create Task
      </button>
    </form>
  );

  const taskCards = (
    <div className="grid gap-3">
      {data.tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-sm text-zinc-500">
          Create a project and task to start saving state in Supabase.
        </div>
      ) : null}
      {data.tasks.map((task) => {
        const state = data.task_states[task.id];

        if (!state) {
          return null;
        }

        return (
          <TaskCard
            key={task.id}
            task={task}
            state={state}
            selected={selectedTask?.id === task.id}
            onSelect={() => {
              setSelectedTaskId(task.id);
              setSelectedProjectId(task.project_id);
            }}
            onStart={() => void handleStartTask(task.id)}
            onContinue={() => void handleContinueTask(task.id)}
          />
        );
      })}
    </div>
  );

  const metricCard = (label: string, value: string | number, icon: ReactNode) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
  const renderAppToolbar = (idSuffix: string) => (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative min-w-0 sm:w-56" htmlFor={`project-switcher-${idSuffix}`}>
        <span className="sr-only">Project Switcher</span>
        <FolderKanban className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <select
          id={`project-switcher-${idSuffix}`}
          value={selectedProject?.id ?? ""}
          onChange={(event) => {
            const projectId = event.target.value;
            const firstTask = data.tasks.find((task) => task.project_id === projectId);

            setSelectedProjectId(projectId);
            if (firstTask) {
              setSelectedTaskId(firstTask.id);
            }
          }}
          disabled={data.projects.length === 0}
          className="min-h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 pl-9 pr-3 text-sm font-medium text-zinc-100 outline-none transition focus:border-emerald-300 disabled:opacity-50"
        >
          {data.projects.length === 0 ? <option value="">No projects</option> : null}
          {data.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}{project.status === "archived" ? " (Archived)" : ""}
            </option>
          ))}
        </select>
      </label>
      <GlobalSearch entries={globalSearchEntries} inputId={`global-search-${idSuffix}`} />
    </div>
  );
  const desktopToolbar = renderAppToolbar("desktop");
  const mobileToolbar = renderAppToolbar("mobile");
  const approvalToastAlert = approvalToast ? (
    <div
      aria-live={approvalToast.tone === "error" ? "assertive" : "polite"}
      className={`fixed bottom-4 right-4 z-[70] w-[min(24rem,calc(100vw-2rem))] rounded-lg border p-4 shadow-2xl shadow-black/30 backdrop-blur ${approvalToastClass(approvalToast.tone)}`}
      role={approvalToast.tone === "error" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
            approvalToast.tone === "success"
              ? "bg-emerald-300"
              : approvalToast.tone === "error"
                ? "bg-rose-300"
                : "bg-amber-300"
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{approvalToast.title}</p>
          <p className="mt-1 break-words text-sm opacity-90">{approvalToast.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => setApprovalToast(null)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-current transition hover:bg-white/10"
          aria-label="Dismiss approval status"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  ) : null;

  function renderShell(content: ReactNode) {
    return (
      <AppShell
        isReady={isReady}
        isSaving={isSaving}
        hasError={Boolean(loadError)}
        title={currentView.title}
        subtitle={currentView.subtitle}
        notificationCount={dashboardNotifications.length}
        notificationsHref="/dashboard#notifications"
        toolbar={desktopToolbar}
        mobileToolbar={mobileToolbar}
        onReload={() => void refreshDashboard()}
      >
        {approvalToastAlert}
        {projectActionDialog}
        {databaseAlert}
        {loadingAlert}
        {content}
      </AppShell>
    );
  }

  if (view === "dashboard") {
    return renderShell(
      <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" aria-label="Dashboard summary">
          {metricCard("Active tasks", activeTasks.length, <Activity className="h-4 w-4 text-sky-300" aria-hidden="true" />)}
          {metricCard("Pending approvals", pendingApprovals.length, <PanelRightOpen className="h-4 w-4 text-amber-300" aria-hidden="true" />)}
          {metricCard("Unread inbox", inboxUnreadCount, <Inbox className="h-4 w-4 text-emerald-300" aria-hidden="true" />)}
          {metricCard("Scheduled content", scheduledContentCount, <CalendarDays className="h-4 w-4 text-violet-300" aria-hidden="true" />)}
          {metricCard("AI cost today", `$${aiCostToday.toFixed(6)}`, <Coins className="h-4 w-4 text-amber-300" aria-hidden="true" />)}
        </section>
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-50">Recent AI Activity</h2>
              <Zap className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </div>
            <div className="grid gap-3">
              {recentAiRuns.length === 0 ? <p className="text-sm text-zinc-500">No AI runs yet.</p> : null}
              {recentAiRuns.map((run) => (
                <article key={run.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>{run.ai_model}</span>
                    <time dateTime={run.created_at}>{formatTime(run.created_at)}</time>
                  </div>
                  <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-zinc-300">{run.output || run.input}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-50">Recent Logs</h2>
              <History className="h-4 w-4 text-violet-300" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {recentLogs.length === 0 ? <p className="text-sm text-zinc-500">No actions saved yet.</p> : null}
              {recentLogs.map((log) => (
                <article key={log.id} className="border-l-2 border-zinc-700 pl-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>{log.actor}</span>
                    <time dateTime={log.created_at}>{formatTime(log.created_at)}</time>
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{log.details}</p>
                </article>
              ))}
            </div>
          </div>
          <div id="notifications" className="scroll-mt-24 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-50">Notifications</h2>
              <Bell className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {visibleNotifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.href}
                  onClick={notification.onSelect}
                  className="group flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 transition hover:border-emerald-300/60 hover:bg-zinc-900"
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notificationToneClass(notification.tone)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <h3 className="truncate font-medium text-zinc-200 transition group-hover:text-emerald-100">{notification.title}</h3>
                      <time dateTime={notification.created_at}>{formatTime(notification.created_at)}</time>
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-zinc-400">{notification.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-50">Today&apos;s Schedule</h2>
              <Clock3 className="h-4 w-4 text-sky-300" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {todaySchedule.length === 0 ? <p className="text-sm text-zinc-500">No content scheduled for today.</p> : null}
              {todaySchedule.map((schedule) => {
                const item = contentItemsById.get(schedule.content_item_id);

                return (
                  <article key={schedule.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-zinc-100">{item?.title ?? "Scheduled content"}</h3>
                        <p className="mt-1 text-xs uppercase text-zinc-500">{item?.content_type ?? "content"}</p>
                      </div>
                      <time className="text-xs text-zinc-500" dateTime={schedule.scheduled_for}>{formatDateTime(schedule.scheduled_for)}</time>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-50">Upcoming Posts</h2>
              <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {upcomingPosts.length === 0 ? <p className="text-sm text-zinc-500">No upcoming posts scheduled.</p> : null}
              {upcomingPosts.map((schedule) => {
                const item = contentItemsById.get(schedule.content_item_id);

                return (
                  <article key={schedule.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-zinc-100">{item?.title ?? "Scheduled content"}</h3>
                        <p className="mt-1 line-clamp-1 text-sm text-zinc-400">{item?.caption_body ?? "Ready for routing"}</p>
                      </div>
                      <span className="inline-flex w-fit rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                        {formatDateTime(schedule.scheduled_for)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </>,
    );
  }

  if (view === "projects") {
    return renderShell(
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside>{projectForm}</aside>
        <div className="grid gap-3">
          {data.projects.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">No projects yet.</div> : null}
          {data.projects.map((project) => (
            <article key={project.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className="min-w-0 text-left"
                >
                  <h2 className="break-words text-lg font-semibold text-zinc-50">{project.name}</h2>
                  <p className="mt-1 break-words text-sm leading-6 text-zinc-400">{project.description}</p>
                  <span className="mt-3 inline-flex rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                    {project.status}
                  </span>
                </button>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleArchiveProject(project.id, project.status !== "archived")}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200"
                  >
                    {project.status === "archived" ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                    {project.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project.id)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-3 text-sm font-medium text-rose-100 transition hover:border-rose-300"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>,
    );
  }

  if (view === "tasks") {
    return renderShell(
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside>{taskForm}</aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-400">{selectedProject?.name ?? "Supabase Workspace"}</p>
              <h2 className="text-2xl font-semibold text-zinc-50">Tasks</h2>
            </div>
            <AiSwitcher selected={selectedModel} onSelect={setSelectedModel} />
          </div>
          {taskCards}
        </div>
      </section>,
    );
  }

  if (view === "inbox") {
    return renderShell(
      <InboxPanel
        project={selectedProject}
        messages={selectedProjectMessages}
        isSaving={isSaving}
        onCreateMessage={handleCreateInboxMessage}
        onCreateTask={handleCreateTaskFromMessage}
        onDraftReply={handleDraftReplyForMessage}
        onRequestApproval={handleRequestReplyApproval}
        onUpdateStatus={handleUpdateInboxMessageStatus}
      />,
    );
  }

  if (view === "ai-brain") {
    return renderShell(
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-400">{selectedProject?.name ?? "Supabase Workspace"}</p>
              <h2 className="text-2xl font-semibold text-zinc-50">Task Context</h2>
            </div>
            <AiSwitcher selected={selectedModel} onSelect={setSelectedModel} />
          </div>
          {taskCards}
          <AiRunHistory runs={selectedRuns} />
        </div>
        <aside className="flex flex-col gap-5">
          <HandoffPanel
            task={selectedTask}
            state={selectedState}
            handoff={selectedHandoff}
            targetAi={selectedModelLabel}
            canGenerate={Boolean(selectedTask && selectedState)}
            isSaving={isSaving}
            onGenerate={() => void handleGenerateHandoff()}
          />
        </aside>
      </section>,
    );
  }

  if (view === "content") {
    return renderShell(
      <ContentCalendarPanel
        project={selectedProject}
        items={selectedProjectContentItems}
        routes={selectedProjectContentRoutes}
        schedules={selectedProjectContentSchedule}
        publishLogs={selectedProjectPublishLogs}
        isSaving={isSaving}
        onCreateContent={handleCreateContentItem}
        onAiAction={handleContentAiAction}
        onMockPublish={handleMockPublishContent}
        onBlockedDelete={handleBlockedContentDelete}
      />,
    );
  }

  if (view === "media") {
    return renderShell(
      <MediaLibraryPanel
        project={selectedProject}
        assets={selectedProjectMediaAssets}
        contentItems={selectedProjectContentItems}
        isSaving={isSaving}
        onCreateAsset={handleCreateMediaAsset}
        onUpdateStatus={handleUpdateMediaAssetStatus}
      />,
    );
  }

  if (view === "rules") {
    return renderShell(<RulesPanel rules={data.rules} />);
  }

  if (view === "approvals") {
    return renderShell(<ApprovalQueue approvals={pendingApprovals} onApprove={(approvalId) => void handleApprove(approvalId)} />);
  }

  if (view === "memory") {
    return renderShell(
      <ProjectMemoryPanel
        key={`${selectedProject?.id ?? "no-project"}-${selectedProjectMemory?.updated_at ?? "draft"}`}
        project={selectedProject}
        memory={selectedProjectMemory}
        isSaving={isSaving}
        onSave={(memory) => void handleSaveProjectMemory(memory)}
        onArchive={(projectId, archived) => void handleArchiveProject(projectId, archived)}
        onDelete={(projectId) => void handleDeleteProject(projectId)}
      />,
    );
  }

  if (view === "connectors") {
    return renderShell(
      <ConnectorManagerPanel
        project={selectedProject}
        connectors={selectedProjectConnectors}
        messages={selectedProjectMessages}
        contentItems={selectedProjectContentItems}
        websiteControlMap={selectedProjectWebsiteControlMap}
        rules={data.rules}
        isSaving={isSaving}
        onSaveConnector={handleSaveConnector}
      />,
    );
  }

  if (view === "analytics") {
    return renderShell(<AnalyticsPanel data={data} />);
  }

  if (view === "automation") {
    return renderShell(
      <AutomationPanel
        project={selectedProject}
        rules={selectedProjectAutomationRules}
        isSaving={isSaving}
        onCreateRule={handleCreateAutomationRule}
        onUpdateStatus={handleUpdateAutomationStatus}
        onRunNow={handleRunAutomationRule}
      />,
    );
  }

  if (view === "settings") {
    return renderShell(
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <h2 className="text-base font-semibold text-zinc-50">Database</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{loadError ? "Setup required" : "Supabase connected"}</p>
          <button
            type="button"
            onClick={() => void refreshDashboard()}
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload
          </button>
        </article>
        <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <h2 className="text-base font-semibold text-zinc-50">Application</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">AI Handover Control Center</p>
          <p className="mt-3 font-mono text-xs text-zinc-500">Next.js + Supabase MVP</p>
        </article>
      </section>,
    );
  }
  return (
    <div className="min-h-screen bg-background text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
                <Workflow className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-400">AI Control Center</p>
                <h1 className="truncate text-2xl font-semibold text-zinc-50">AI Handover Control Center</h1>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-400">
              <Save className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <span>{loadError ? "Database needs setup" : isSaving ? "Saving" : isReady ? "Supabase connected" : "Loading database"}</span>
            </div>
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200"
              title="Reload from Supabase"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload
            </button>
          </div>
        </div>
      </header>

      {approvalToastAlert}

      {pendingProjectAction && pendingProject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 px-4">
          <section
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-5 shadow-2xl shadow-black/40"
            role="dialog"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-300/10 text-amber-200">
                {pendingProjectAction.kind === "delete" ? (
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                ) : pendingProjectAction.kind === "archive" ? (
                  <Archive className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-zinc-50">
                  {pendingProjectAction.kind === "delete"
                    ? "Delete project?"
                    : pendingProjectAction.kind === "archive"
                      ? "Archive project?"
                      : "Restore project?"}
                </h2>
                <p className="mt-2 break-words text-sm leading-6 text-zinc-400">
                  {pendingProjectAction.kind === "delete"
                    ? `This will delete ${pendingProject.name} and all linked tasks from Supabase.`
                    : `${pendingProjectAction.kind === "archive" ? "Archive" : "Restore"} ${pendingProject.name}.`}
                </p>
                {pendingProjectAction.kind === "delete" ? (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Deletion cannot be undone.</span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingProjectAction(null)}
                disabled={isSaving}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmProjectAction()}
                disabled={isSaving}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pendingProjectAction.kind === "delete"
                    ? "bg-rose-400 text-zinc-950 hover:bg-rose-300"
                    : "bg-amber-300 text-zinc-950 hover:bg-amber-200"
                }`}
              >
                {pendingProjectAction.kind === "delete" ? (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                ) : pendingProjectAction.kind === "archive" ? (
                  <Archive className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                {pendingProjectAction.kind === "delete"
                  ? "Delete Project"
                  : pendingProjectAction.kind === "archive"
                    ? "Archive Project"
                    : "Restore Project"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {loadError ? (
          <section className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">Supabase is connected, but the database is not ready.</p>
                <p className="mt-1 break-words">{loadError}</p>
                <p className="mt-2 text-amber-100/80">Run <span className="font-mono">database/schema.sql</span> in Supabase SQL editor, then press Reload.</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7" aria-label="Today summary">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">Active tasks</span>
              <Activity className="h-4 w-4 text-sky-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{activeTasks.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">Pending approvals</span>
              <PanelRightOpen className="h-4 w-4 text-amber-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{pendingApprovals.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">Unread inbox</span>
              <Inbox className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{inboxUnreadCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">AI runs</span>
              <Zap className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{data.ai_runs.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">Handoffs</span>
              <Layers3 className="h-4 w-4 text-violet-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{handoffCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">AI cost</span>
              <Coins className="h-4 w-4 text-amber-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-zinc-50">${totalCost.toFixed(6)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-400">Tokens</span>
              <Sigma className="h-4 w-4 text-sky-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-zinc-50">{totalTokens}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
          <aside className="flex flex-col gap-5">
            <form onSubmit={handleCreateProject} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-50">New Project</h2>
                <Plus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              </div>
              <label className="block text-sm text-zinc-400" htmlFor="project-name">Name</label>
              <input
                id="project-name"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Project name"
              />
              <label className="mt-4 block text-sm text-zinc-400" htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Workspace description"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Project
              </button>
            </form>

            <form onSubmit={handleCreateTask} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-50">New Task</h2>
                <Plus className="h-4 w-4 text-sky-300" aria-hidden="true" />
              </div>
              <label className="block text-sm text-zinc-400" htmlFor="task-project">Project</label>
              <select
                id="task-project"
                value={selectedProjectId}
                disabled={activeProjects.length === 0}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300 disabled:opacity-50"
              >
                {activeProjects.length === 0 ? <option value="">Create an active project first</option> : null}
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <label className="mt-4 block text-sm text-zinc-400" htmlFor="task-title">Title</label>
              <input
                id="task-title"
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Short title"
              />
              <label className="mt-4 block text-sm text-zinc-400" htmlFor="task-goal">Goal</label>
              <textarea
                id="task-goal"
                value={newTaskGoal}
                onChange={(event) => setNewTaskGoal(event.target.value)}
                className="mt-2 min-h-28 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="What should AI complete?"
              />
              <button
                type="submit"
                disabled={!canCreateTask}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Task
              </button>
            </form>

            <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-50">Action Logs</h2>
                <History className="h-4 w-4 text-violet-300" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                {selectedLogs.length === 0 ? (
                  <p className="text-sm text-zinc-500">No actions saved yet.</p>
                ) : (
                  selectedLogs.map((log) => (
                    <article key={log.id} className="border-l-2 border-zinc-700 pl-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                        <span>{log.actor}</span>
                        <time dateTime={log.created_at}>{formatTime(log.created_at)}</time>
                      </div>
                      <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{log.details}</p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-400">{selectedProject?.name ?? "Supabase Workspace"}</p>
                <h2 className="text-2xl font-semibold text-zinc-50">Tasks</h2>
              </div>
              <div className="flex flex-col gap-2 sm:items-start lg:items-end">
                <span className="text-sm text-zinc-400">Switch target</span>
                <AiSwitcher selected={selectedModel} onSelect={setSelectedModel} />
              </div>
            </div>

            <InboxPanel
              project={selectedProject}
              messages={selectedProjectMessages}
              isSaving={isSaving}
              onCreateMessage={handleCreateInboxMessage}
              onCreateTask={handleCreateTaskFromMessage}
              onDraftReply={handleDraftReplyForMessage}
              onRequestApproval={handleRequestReplyApproval}
              onUpdateStatus={handleUpdateInboxMessageStatus}
            />

            <div className="mt-5">
              <ContentCalendarPanel
                project={selectedProject}
                items={selectedProjectContentItems}
                routes={selectedProjectContentRoutes}
                schedules={selectedProjectContentSchedule}
                publishLogs={selectedProjectPublishLogs}
                isSaving={isSaving}
                onCreateContent={handleCreateContentItem}
                onAiAction={handleContentAiAction}
                onMockPublish={handleMockPublishContent}
                onBlockedDelete={handleBlockedContentDelete}
              />
            </div>

            <div className="mt-5 grid gap-3">
              {data.tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-sm text-zinc-500">
                  Create a project and task to start saving state in Supabase.
                </div>
              ) : null}
              {data.tasks.map((task) => {
                const state = data.task_states[task.id];

                if (!state) {
                  return null;
                }

                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    state={state}
                    selected={selectedTask?.id === task.id}
                    onSelect={() => {
                      setSelectedTaskId(task.id);
                      setSelectedProjectId(task.project_id);
                    }}
                    onStart={() => void handleStartTask(task.id)}
                    onContinue={() => void handleContinueTask(task.id)}
                  />
                );
              })}
            </div>
            <AiRunHistory runs={selectedRuns} />
          </section>

          <aside className="flex flex-col gap-5">
            <ProjectMemoryPanel
              key={`${selectedProject?.id ?? "no-project"}-${selectedProjectMemory?.updated_at ?? "draft"}`}
              project={selectedProject}
              memory={selectedProjectMemory}
              isSaving={isSaving}
              onSave={(memory) => void handleSaveProjectMemory(memory)}
              onArchive={(projectId, archived) => void handleArchiveProject(projectId, archived)}
              onDelete={(projectId) => void handleDeleteProject(projectId)}
            />
            <RulesPanel rules={data.rules} />
            <HandoffPanel
              task={selectedTask}
              state={selectedState}
              handoff={selectedHandoff}
              targetAi={selectedModelLabel}
              canGenerate={Boolean(selectedTask && selectedState)}
              isSaving={isSaving}
              onGenerate={() => void handleGenerateHandoff()}
            />
            <ApprovalQueue approvals={pendingApprovals} onApprove={(approvalId) => void handleApprove(approvalId)} />
          </aside>
        </section>
      </main>
    </div>
  );
}






























