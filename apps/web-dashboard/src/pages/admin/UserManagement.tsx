import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockUsers = [
  { id: "1", name: "John Smith", email: "john.smith@acme.com", role: "SECURITY_ANALYST", status: "active", last_login_at: new Date(Date.now() - 3600000).toISOString() },
  { id: "2", name: "Jane Doe", email: "jane.doe@acme.com", role: "READ_ONLY", status: "active", last_login_at: new Date(Date.now() - 86400000).toISOString() },
  { id: "3", name: "Admin User", email: "admin@acme.com", role: "TENANT_ADMIN", status: "active", last_login_at: new Date(Date.now() - 7200000).toISOString() },
  { id: "4", name: "Bob Wilson", email: "bob@acme.com", role: "SECURITY_ANALYST", status: "suspended", last_login_at: new Date(Date.now() - 2592000000).toISOString() },
];

const roleColor: Record<string, string> = {
  TENANT_ADMIN: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  SECURITY_ANALYST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  READ_ONLY: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("SECURITY_ANALYST");
  const [search, setSearch] = useState("");

  const { data: users = mockUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users");
      return res.data.data;
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      await apiClient.post("/admin/users/invite", { email: inviteEmail, role: inviteRole });
    },
    onSuccess: () => {
      setShowInvite(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.patch(`/admin/users/${id}`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const timeAgo = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (d > 30) return `${d}d ago`;
    if (d > 0) return `${d}d ago`;
    return `${h}h ago`;
  };

  const filtered = users.filter((u: any) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} users in your organization</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite User
        </button>
      </div>

      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              {["User", "Role", "Status", "Last Login", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((user: any) => (
              <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${roleColor[user.role] ?? "bg-slate-700 text-slate-300"}`}>
                    {user.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(user.last_login_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Edit Role</button>
                    <button
                      onClick={() => updateUser.mutate({ id: user.id, status: user.status === "active" ? "suspended" : "active" })}
                      className={`text-xs transition-colors ${user.status === "active" ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}`}>
                      {user.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Invite New User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Email Address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="user@company.com" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="SECURITY_ANALYST">Security Analyst</option>
                  <option value="READ_ONLY">Read Only (Executive)</option>
                  <option value="TENANT_ADMIN">Tenant Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowInvite(false)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={() => inviteUser.mutate()}
                disabled={!inviteEmail || inviteUser.isPending}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                {inviteUser.isPending ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
