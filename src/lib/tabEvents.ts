type Listener = () => void;

const profileResetListeners = new Set<Listener>();
const homeResetListeners = new Set<Listener>();
const exploreResetListeners = new Set<Listener>();

// ─── Profile Tab Reset ──────────────────────────────────────────
export const emitProfileTabReset = () => {
  profileResetListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[tabEvents] Error in profile reset listener:', e);
    }
  });
};

export const onProfileTabReset = (listener: Listener) => {
  profileResetListeners.add(listener);
  return () => {
    profileResetListeners.delete(listener);
  };
};

// ─── Home Tab Reset ─────────────────────────────────────────────
export const emitHomeTabReset = () => {
  homeResetListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[tabEvents] Error in home reset listener:', e);
    }
  });
};

export const onHomeTabReset = (listener: Listener) => {
  homeResetListeners.add(listener);
  return () => {
    homeResetListeners.delete(listener);
  };
};

// ─── Explore Tab Reset ──────────────────────────────────────────
export const emitExploreTabReset = () => {
  exploreResetListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[tabEvents] Error in explore reset listener:', e);
    }
  });
};

export const onExploreTabReset = (listener: Listener) => {
  exploreResetListeners.add(listener);
  return () => {
    exploreResetListeners.delete(listener);
  };
};

// ─── BRAND PORTAL TAB EVENTS ─────────────────────────────────────
const brandHomeResetListeners = new Set<Listener>();
const brandExploreResetListeners = new Set<Listener>();
const brandPostsResetListeners = new Set<Listener>();
const brandProfileResetListeners = new Set<Listener>();

// 1. Brand Home Tab Reset
export const emitBrandHomeTabReset = () => {
  brandHomeResetListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[tabEvents] Error in brand home reset listener:', e);
    }
  });
};

export const onBrandHomeTabReset = (listener: Listener) => {
  brandHomeResetListeners.add(listener);
  return () => {
    brandHomeResetListeners.delete(listener);
  };
};

// 2. Brand Explore Tab Reset
export const emitBrandExploreTabReset = () => {
  brandExploreResetListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[tabEvents] Error in brand explore reset listener:', e);
    }
  });
};

export const onBrandExploreTabReset = (listener: Listener) => {
  brandExploreResetListeners.add(listener);
  return () => {
    brandExploreResetListeners.delete(listener);
  };
};

// 3. Brand Posts Tab Reset
export const emitBrandPostsTabReset = () => {
  brandPostsResetListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[tabEvents] Error in brand posts reset listener:', e);
    }
  });
};

export const onBrandPostsTabReset = (listener: Listener) => {
  brandPostsResetListeners.add(listener);
  return () => {
    brandPostsResetListeners.delete(listener);
  };
};

// 4. Brand Profile Tab Reset (Navigates back to first page 'menu')
export const emitBrandProfileTabReset = () => {
  brandProfileResetListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[tabEvents] Error in brand profile reset listener:', e);
    }
  });
};

export const onBrandProfileTabReset = (listener: Listener) => {
  brandProfileResetListeners.add(listener);
  return () => {
    brandProfileResetListeners.delete(listener);
  };
};

// 5. Brand Agent Tab Reset (Scrolls chat to bottom and resets input)
const brandAgentResetListeners = new Set<Listener>();

export const emitBrandAgentTabReset = () => {
  brandAgentResetListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[tabEvents] Error in brand agent reset listener:', e);
    }
  });
};

export const onBrandAgentTabReset = (listener: Listener) => {
  brandAgentResetListeners.add(listener);
  return () => {
    brandAgentResetListeners.delete(listener);
  };
};
