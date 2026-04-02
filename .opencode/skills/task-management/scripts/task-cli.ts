#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

const TASKS_DIR = '.tmp/tasks';
const COMPLETED_DIR = '.tmp/tasks/completed';

interface Task {
  id: string;
  name: string;
  status: string;
  objective: string;
  context_files: string[];
  reference_files: string[];
  exit_criteria: string[];
  subtask_count: number;
  completed_count: number;
  created_at: string;
  completed_at: string | null;
}

interface Subtask {
  id: string;
  seq: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  depends_on: string[];
  parallel: boolean;
  suggested_agent?: string;
  context_files: string[];
  reference_files: string[];
  acceptance_criteria: string[];
  deliverables: string[];
  started_at: string | null;
  completed_at: string | null;
  completion_summary: string | null;
}

function loadTask(feature: string): Task | null {
  const taskPath = path.join(TASKS_DIR, feature, 'task.json');
  if (!fs.existsSync(taskPath)) return null;
  return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
}

function loadSubtasks(feature: string): Subtask[] {
  const featureDir = path.join(TASKS_DIR, feature);
  if (!fs.existsSync(featureDir)) return [];
  
  const files = fs.readdirSync(featureDir);
  const subtasks: Subtask[] = [];
  
  for (const file of files) {
    if (file.match(/^subtask_\d+\.json$/)) {
      const content = JSON.parse(fs.readFileSync(path.join(featureDir, file), 'utf-8'));
      subtasks.push(content);
    }
  }
  
  return subtasks.sort((a, b) => parseInt(a.seq) - parseInt(b.seq));
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'in_progress': return '○';
    case 'blocked': return '✗';
    default: return '·';
  }
}

function showStatus(feature?: string) {
  if (feature) {
    const task = loadTask(feature);
    if (!task) {
      console.log(`No task found for: ${feature}`);
      return;
    }
    
    const subtasks = loadSubtasks(feature);
    const progress = Math.round((task.completed_count / task.subtask_count) * 100);
    
    console.log(`\n[${feature}] ${task.name}`);
    console.log(`  Status: ${task.status} | Progress: ${progress}% (${task.completed_count}/${task.subtask_count})`);
    console.log(`  Objective: ${task.objective}`);
    console.log(`\n  Subtasks:`);
    
    for (const sub of subtasks) {
      const icon = getStatusIcon(sub.status);
      const parallel = sub.parallel ? '[parallel]' : '[sequential]';
      console.log(`    ${icon} ${sub.seq} - ${sub.title} ${parallel}`);
      if (sub.depends_on.length > 0) {
        console.log(`       Depends on: ${sub.depends_on.join(', ')}`);
      }
    }
    
    if (task.exit_criteria.length > 0) {
      console.log(`\n  Exit Criteria:`);
      task.exit_criteria.forEach(c => console.log(`    · ${c}`));
    }
  } else {
    // Show all tasks
    if (!fs.existsSync(TASKS_DIR)) {
      console.log('No tasks directory found');
      return;
    }
    
    const features = fs.readdirSync(TASKS_DIR).filter(f => {
      const stat = fs.statSync(path.join(TASKS_DIR, f));
      return stat.isDirectory() && fs.existsSync(path.join(TASKS_DIR, f, 'task.json'));
    });
    
    if (features.length === 0) {
      console.log('No tasks found');
      return;
    }
    
    console.log('\n=== All Tasks ===\n');
    for (const f of features) {
      const task = loadTask(f);
      if (task) {
        const progress = Math.round((task.completed_count / task.subtask_count) * 100);
        console.log(`[${f}] ${task.name}`);
        console.log(`  Status: ${task.status} | Progress: ${progress}% (${task.completed_count}/${task.subtask_count})`);
      }
    }
  }
}

function showNext(feature?: string) {
  if (feature) {
    const task = loadTask(feature);
    if (!task) {
      console.log(`No task found for: ${feature}`);
      return;
    }
    
    const subtasks = loadSubtasks(feature);
    const completedSeqs = new Set(subtasks.filter(s => s.status === 'completed').map(s => s.seq));
    
    const ready = subtasks.filter(s => {
      if (s.status !== 'pending') return false;
      return s.depends_on.every(dep => completedSeqs.has(dep));
    });
    
    if (ready.length === 0) {
      console.log(`\nNo ready tasks for ${feature}`);
      return;
    }
    
    console.log(`\n=== Ready Tasks for ${feature} ===\n`);
    for (const sub of ready) {
      const parallel = sub.parallel ? '[parallel]' : '[sequential]';
      console.log(`  ${sub.seq} - ${sub.title} ${parallel}`);
    }
  } else {
    // Show next for all features
    if (!fs.existsSync(TASKS_DIR)) {
      console.log('No tasks directory found');
      return;
    }
    
    const features = fs.readdirSync(TASKS_DIR).filter(f => {
      const stat = fs.statSync(path.join(TASKS_DIR, f));
      return stat.isDirectory() && fs.existsSync(path.join(TASKS_DIR, f, 'task.json'));
    });
    
    console.log('\n=== Ready Tasks (deps satisfied) ===\n');
    
    for (const f of features) {
      const subtasks = loadSubtasks(f);
      const completedSeqs = new Set(subtasks.filter(s => s.status === 'completed').map(s => s.seq));
      
      const ready = subtasks.filter(s => {
        if (s.status !== 'pending') return false;
        return s.depends_on.every(dep => completedSeqs.has(dep));
      });
      
      if (ready.length > 0) {
        console.log(`[${f}]`);
        for (const sub of ready) {
          const parallel = sub.parallel ? '[parallel]' : '[sequential]';
          console.log(`  ${sub.seq} - ${sub.title} ${parallel}`);
        }
        console.log();
      }
    }
  }
}

function showParallel(feature?: string) {
  if (feature) {
    const task = loadTask(feature);
    if (!task) {
      console.log(`No task found for: ${feature}`);
      return;
    }
    
    const subtasks = loadSubtasks(feature);
    const completedSeqs = new Set(subtasks.filter(s => s.status === 'completed').map(s => s.seq));
    
    const parallelReady = subtasks.filter(s => {
      if (s.status !== 'pending' || !s.parallel) return false;
      return s.depends_on.every(dep => completedSeqs.has(dep));
    });
    
    if (parallelReady.length === 0) {
      console.log(`\nNo parallelizable ready tasks for ${feature}`);
      return;
    }
    
    console.log(`\n=== Parallelizable Ready Tasks for ${feature} ===\n`);
    for (const sub of parallelReady) {
      console.log(`  ${sub.seq} - ${sub.title}`);
    }
  } else {
    console.log('\n=== Parallelizable Tasks ===\n');
    
    if (!fs.existsSync(TASKS_DIR)) {
      console.log('No tasks directory found');
      return;
    }
    
    const features = fs.readdirSync(TASKS_DIR).filter(f => {
      const stat = fs.statSync(path.join(TASKS_DIR, f));
      return stat.isDirectory() && fs.existsSync(path.join(TASKS_DIR, f, 'task.json'));
    });
    
    for (const f of features) {
      const subtasks = loadSubtasks(f);
      const completedSeqs = new Set(subtasks.filter(s => s.status === 'completed').map(s => s.seq));
      
      const parallelReady = subtasks.filter(s => {
        if (s.status !== 'pending' || !s.parallel) return false;
        return s.depends_on.every(dep => completedSeqs.has(dep));
      });
      
      if (parallelReady.length > 0) {
        console.log(`[${f}]`);
        for (const sub of parallelReady) {
          console.log(`  ${sub.seq} - ${sub.title}`);
        }
        console.log();
      }
    }
  }
}

function showBlocked(feature?: string) {
  if (feature) {
    const subtasks = loadSubtasks(feature);
    const blocked = subtasks.filter(s => s.status === 'blocked');
    
    if (blocked.length === 0) {
      console.log(`\nNo blocked tasks for ${feature}`);
      return;
    }
    
    console.log(`\n=== Blocked Tasks for ${feature} ===\n`);
    for (const sub of blocked) {
      console.log(`  ${sub.seq} - ${sub.title}`);
    }
  } else {
    console.log('\n=== Blocked Tasks ===\n');
    
    if (!fs.existsSync(TASKS_DIR)) {
      console.log('No tasks directory found');
      return;
    }
    
    const features = fs.readdirSync(TASKS_DIR).filter(f => {
      const stat = fs.statSync(path.join(TASKS_DIR, f));
      return stat.isDirectory() && fs.existsSync(path.join(TASKS_DIR, f, 'task.json'));
    });
    
    for (const f of features) {
      const subtasks = loadSubtasks(f);
      const blocked = subtasks.filter(s => s.status === 'blocked');
      
      if (blocked.length > 0) {
        console.log(`[${f}]`);
        for (const sub of blocked) {
          console.log(`  ${sub.seq} - ${sub.title}`);
        }
        console.log();
      }
    }
  }
}

function showDeps(feature: string, seq: string) {
  const subtasks = loadSubtasks(feature);
  const target = subtasks.find(s => s.seq === seq);
  
  if (!target) {
    console.log(`Task ${feature}/${seq} not found`);
    return;
  }
  
  console.log(`\n=== Dependency Tree: ${feature}/${seq} ===\n`);
  console.log(`${seq} - ${target.title} [${target.status}]`);
  
  if (target.depends_on.length === 0) {
    console.log('  No dependencies');
    return;
  }
  
  for (const dep of target.depends_on) {
    const depTask = subtasks.find(s => s.seq === dep);
    if (depTask) {
      const icon = getStatusIcon(depTask.status);
      console.log(`  ${icon} ${dep} - ${depTask.title} [${depTask.status}]`);
    }
  }
}

function completeTask(feature: string, seq: string, summary: string) {
  const task = loadTask(feature);
  if (!task) {
    console.log(`No task found for: ${feature}`);
    return;
  }
  
  const subtasks = loadSubtasks(feature);
  const target = subtasks.find(s => s.seq === seq);
  
  if (!target) {
    console.log(`Subtask ${seq} not found in ${feature}`);
    return;
  }
  
  // Update subtask
  target.status = 'completed';
  target.completed_at = new Date().toISOString();
  target.completion_summary = summary;
  
  const subtaskPath = path.join(TASKS_DIR, feature, `subtask_${seq}.json`);
  fs.writeFileSync(subtaskPath, JSON.stringify(target, null, 2));
  
  // Update task count
  const completedCount = subtasks.filter(s => s.status === 'completed').length;
  task.completed_count = completedCount;
  
  if (completedCount === task.subtask_count) {
    task.status = 'completed';
    task.completed_at = new Date().toISOString();
  }
  
  const taskPath = path.join(TASKS_DIR, feature, 'task.json');
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  
  console.log(`\n✓ Marked ${feature}/${seq} as completed`);
  console.log(`  Summary: ${summary}`);
  console.log(`  Progress: ${completedCount}/${task.subtask_count}`);
}

function validateTasks(feature?: string) {
  console.log('\n=== Validation Results ===\n');
  
  if (feature) {
    validateFeature(feature);
  } else {
    if (!fs.existsSync(TASKS_DIR)) {
      console.log('No tasks directory found');
      return;
    }
    
    const features = fs.readdirSync(TASKS_DIR).filter(f => {
      const stat = fs.statSync(path.join(TASKS_DIR, f));
      return stat.isDirectory() && fs.existsSync(path.join(TASKS_DIR, f, 'task.json'));
    });
    
    for (const f of features) {
      validateFeature(f);
    }
  }
}

function validateFeature(feature: string) {
  console.log(`[${feature}]`);
  
  const task = loadTask(feature);
  if (!task) {
    console.log('  ✗ task.json not found');
    return;
  }
  
  const subtasks = loadSubtasks(feature);
  const errors: string[] = [];
  
  // Check task structure
  if (task.id !== feature) {
    errors.push(`Task ID mismatch: ${task.id} !== ${feature}`);
  }
  
  if (subtasks.length !== task.subtask_count) {
    errors.push(`Subtask count mismatch: ${subtasks.length} files vs ${task.subtask_count} in task.json`);
  }
  
  // Check subtasks
  const seqs = new Set<string>();
  for (const sub of subtasks) {
    // Check ID format
    if (!sub.id.startsWith(feature)) {
      errors.push(`Subtask ${sub.seq} ID doesn't start with feature name: ${sub.id}`);
    }
    
    // Check unique seq
    if (seqs.has(sub.seq)) {
      errors.push(`Duplicate sequence number: ${sub.seq}`);
    }
    seqs.add(sub.seq);
    
    // Check dependencies exist
    for (const dep of sub.depends_on) {
      if (!seqs.has(dep) && !subtasks.find(s => s.seq === dep)) {
        errors.push(`Subtask ${sub.seq} depends on non-existent task: ${dep}`);
      }
    }
    
    // Check for self-dependency
    if (sub.depends_on.includes(sub.seq)) {
      errors.push(`Subtask ${sub.seq} depends on itself`);
    }
    
    // Check required fields
    if (!sub.acceptance_criteria || sub.acceptance_criteria.length === 0) {
      errors.push(`Subtask ${sub.seq} has no acceptance_criteria`);
    }
    
    if (!sub.deliverables || sub.deliverables.length === 0) {
      errors.push(`Subtask ${sub.seq} has no deliverables`);
    }
  }
  
  // Check for circular dependencies
  const circular = detectCircularDeps(subtasks);
  if (circular) {
    errors.push(`Circular dependency detected: ${circular}`);
  }
  
  if (errors.length === 0) {
    console.log('  ✓ All checks passed');
  } else {
    for (const err of errors) {
      console.log(`  ✗ ${err}`);
    }
  }
  console.log();
}

function detectCircularDeps(subtasks: Subtask[]): string | null {
  const graph = new Map<string, string[]>();
  
  for (const sub of subtasks) {
    graph.set(sub.seq, sub.depends_on);
  }
  
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function dfs(node: string, path: string[]): string | null {
    visited.add(node);
    recStack.add(node);
    
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        const result = dfs(dep, [...path, node]);
        if (result) return result;
      } else if (recStack.has(dep)) {
        return [...path, node, dep].join(' -> ');
      }
    }
    
    recStack.delete(node);
    return null;
  }
  
  for (const sub of subtasks) {
    if (!visited.has(sub.seq)) {
      const result = dfs(sub.seq, []);
      if (result) return result;
    }
  }
  
  return null;
}

function showHelp() {
  console.log(`
Task Management CLI

Usage:
  npx ts-node task-cli.ts <command> [options]

Commands:
  status [feature]          Show task status summary
  next [feature]              Show next eligible tasks (deps satisfied)
  parallel [feature]          Show parallelizable tasks ready to run
  deps <feature> <seq>        Show dependency tree for a subtask
  blocked [feature]           Show blocked tasks
  complete <feature> <seq> "summary"  Mark subtask complete
  validate [feature]          Validate JSON files and dependencies
  help                        Show this help message

Examples:
  npx ts-node task-cli.ts status
  npx ts-node task-cli.ts status my-feature
  npx ts-node task-cli.ts next my-feature
  npx ts-node task-cli.ts complete my-feature 05 "Implemented auth"
  npx ts-node task-cli.ts validate
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
    showStatus(args[1]);
    break;
  case 'next':
    showNext(args[1]);
    break;
  case 'parallel':
    showParallel(args[1]);
    break;
  case 'deps':
    if (args.length < 3) {
      console.log('Usage: deps <feature> <seq>');
    } else {
      showDeps(args[1], args[2]);
    }
    break;
  case 'blocked':
    showBlocked(args[1]);
    break;
  case 'complete':
    if (args.length < 4) {
      console.log('Usage: complete <feature> <seq> "summary"');
    } else {
      completeTask(args[1], args[2], args[3]);
    }
    break;
  case 'validate':
    validateTasks(args[1]);
    break;
  case 'help':
  default:
    showHelp();
    break;
}
