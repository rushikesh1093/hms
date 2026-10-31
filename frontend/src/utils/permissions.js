/** UI-side permission map. The API enforces the same rules; this only hides controls. */
export const PERMISSIONS = {
  registerPatient: ['admin', 'receptionist'],
  editPatient: ['admin', 'receptionist'],
  deletePatient: ['admin'],
  viewClinical: ['admin', 'doctor'],
  addCheckup: ['admin', 'doctor'],
  updateFollowupStatus: ['admin', 'doctor'],
  rescheduleFollowup: ['admin', 'doctor', 'receptionist'],
  viewReports: ['admin', 'doctor'],
  manageUsers: ['admin'],
  viewAudit: ['admin'],
};

export function can(user, permission) {
  return !!user && (PERMISSIONS[permission] || []).includes(user.role);
}

export function canEditCheckup(user, checkup) {
  if (!user || !checkup) return false;
  return user.role === 'admin' || (user.role === 'doctor' && checkup.doctor_id === user.id);
}
