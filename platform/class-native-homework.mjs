// Workspace-scoped teacher data must already come from the authenticated teacher API.
// Match both membership and program; a class is not interchangeable with a program.
export function individualClassNativeHomework(data, membershipId, programId) {
  const tasks = (data.nativeTasks || []).filter(task => task.programId === programId);
  const assignments = (data.nativeAssignments || [])
    .filter(assignment => assignment.membershipId === membershipId)
    .sort((a, b) => Date.parse(b.assignedAt || b.deadlineAt || 0) -
      Date.parse(a.assignedAt || a.deadlineAt || 0));
  return { tasks, assignments };
}

export function taskMatchesClass(task, programId) {
  return !!task && !!programId && task.programId === programId;
}
