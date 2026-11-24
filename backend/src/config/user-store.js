export class UserStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function createUserStore(db) {
  const users = db.collection('users');
  const control = db.collection('_internal').doc('user_management');
  const isAdmin = (user) => user?.role === 'ADMIN' && user?.is_active === true;

  return {
    async checkConnection() {
      await control.get();
    },
    async getUser(id) {
      const doc = await users.doc(id).get();
      return doc.exists ? doc.data() : null;
    },
    async listUsers({ search = '', role = '' }) {
      const snapshot = await users.orderBy('created_at', 'desc').get();
      const needle = search.toLowerCase();
      return snapshot.docs.map((doc) => doc.data())
        .filter((user) => (!role || user.role === role) &&
          (!needle || `${user.full_name} ${user.email}`.toLowerCase().includes(needle)))
        .slice(0, 200);
    },
    async bootstrap(user) {
      await db.runTransaction(async (tx) => {
        const [state, existing] = await Promise.all([tx.get(control), tx.get(users.limit(1))]);
        if (state.exists || !existing.empty) throw new UserStoreError('SETUP_COMPLETE');
        tx.create(control, { activeAdmins: 1 });
        tx.create(users.doc(user.id), user);
      });
    },
    async createUser(actorId, user) {
      await db.runTransaction(async (tx) => {
        const [state, actor] = await Promise.all([tx.get(control), tx.get(users.doc(actorId))]);
        if (!isAdmin(actor.data())) throw new UserStoreError('FORBIDDEN');
        if (!state.exists || !Number.isInteger(state.data().activeAdmins)) throw new UserStoreError('INVALID_STATE');
        tx.create(users.doc(user.id), user);
        tx.update(control, { activeAdmins: state.data().activeAdmins + (isAdmin(user) ? 1 : 0) });
      });
    },
    async updateUser(actorId, id, changes) {
      return db.runTransaction(async (tx) => {
        const targetRef = users.doc(id);
        const [state, actor, target] = await Promise.all([
          tx.get(control), tx.get(users.doc(actorId)), tx.get(targetRef)
        ]);
        if (!isAdmin(actor.data())) throw new UserStoreError('FORBIDDEN');
        if (!target.exists) throw new UserStoreError('NOT_FOUND');
        if (!state.exists || !Number.isInteger(state.data().activeAdmins)) throw new UserStoreError('INVALID_STATE');
        const current = target.data();
        const updated = {
          ...current,
          role: changes.role ?? current.role,
          is_active: changes.isActive ?? current.is_active,
          updated_at: new Date().toISOString()
        };
        if (current.is_active && !updated.is_active) {
          updated.sessions_valid_after = Math.floor(Date.now() / 1000);
        }
        const count = state.data().activeAdmins - Number(isAdmin(current)) + Number(isAdmin(updated));
        if (count < 1) throw new UserStoreError('LAST_ADMIN');
        tx.update(targetRef, updated);
        tx.update(control, { activeAdmins: count });
        return updated;
      });
    }
  };
}
