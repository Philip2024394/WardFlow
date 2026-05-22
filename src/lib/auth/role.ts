import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/roles';

export async function getRole(): Promise<{
  userId: string | null;
  role: UserRole | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { userId: null, role: null };
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    return { userId: user.id, role: (data?.role ?? null) as UserRole | null };
  } catch {
    // Supabase not configured yet — treat as unauthenticated.
    return { userId: null, role: null };
  }
}

export async function requireRole(allowed: UserRole | UserRole[]): Promise<{
  userId: string;
  role: UserRole;
}> {
  const { userId, role } = await getRole();
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  if (!userId || !role) {
    redirect('/login');
  }
  if (!allowedList.includes(role)) {
    // Land on their actual home if they have the wrong role for this section.
    redirect('/login');
  }
  return { userId, role };
}
