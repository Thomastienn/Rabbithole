import { EndpointError } from '../../providers/openai.mjs';
import { DEFAULT_TUTOR_STYLE } from '../../media/diagrams.mjs';

// Model profiles, chat, smart and suggestion settings, and custom endpoints.
export async function settingsRoutes(req, res, url, ctx, body) {
  const { store, json, endpoint, selectionError, chatDefault, smart, profiles } = ctx;
  if (req.method === 'GET') {
    if (url.pathname === '/api/settings/searxng') return json(res, 200, await ctx.search.status());
    if (url.pathname === '/api/settings/endpoint' && endpoint)
      return json(res, 200, endpoint.status());
    if (url.pathname === '/api/settings/endpoints' && endpoint)
      return json(res, 200, endpoint.list());
    if (url.pathname === '/api/settings/suggestions')
      return json(res, 200, store.suggestionSettings());
    if (url.pathname === '/api/settings/chat') return json(res, 200, chatDefault());
    if (url.pathname === '/api/settings/smart') return json(res, 200, smart());
    if (url.pathname === '/api/profiles') return json(res, 200, profiles());
    if (url.pathname === '/api/settings/tutor-style')
      return json(res, 200, { style: store.tutorStyle(), default: DEFAULT_TUTOR_STYLE });
    return false;
  }
  if (req.method !== 'POST') return false;
  if (['/api/settings/searxng', '/api/settings/searxng/test'].includes(url.pathname)) {
    try {
      if (url.pathname.endsWith('/test'))
        return json(res, 200, await ctx.search.status({ url: body?.url }));
      ctx.search.save(body?.url);
      return json(res, 200, await ctx.search.status());
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/(rename|duplicate|delete)$/);
  if (url.pathname === '/api/profiles' || profileMatch) {
    const [, id, action = 'create'] = profileMatch ?? [];
    const current = id && store.profileName(id);
    if (id && !current)
      return json(res, 404, {
        error: 'Profile not found. Reopen Settings and choose a listed profile.',
      });
    if (action === 'delete') {
      if (!store.deleteProfile(id))
        return json(res, 409, {
          error: 'Keep at least one profile. Create another before deleting this one.',
        });
      return json(res, 200, profiles());
    }
    // Duplicate names itself "<name> copy", then "<name> copy 2", … until free.
    let name =
      action === 'duplicate'
        ? `${current.slice(0, 50)} copy`
        : typeof body?.name === 'string'
          ? body.name.trim()
          : '';
    if (!name || name.length > 60)
      return json(res, 400, { error: 'Name the profile (up to 60 characters).' });
    if (action === 'rename') {
      if (!store.renameProfile(id, name))
        return json(res, 409, {
          error: `A profile named “${name}” already exists. Choose another name.`,
        });
    } else if (action === 'duplicate') {
      for (let n = 2, base = name; !store.createProfile(name, id); n++) name = `${base} ${n}`;
    } else if (!store.createProfile(name))
      return json(res, 409, {
        error: `A profile named “${name}” already exists. Choose another name.`,
      });
    return json(res, 200, profiles());
  }
  if (url.pathname === '/api/profiles/active') {
    if (typeof body?.id !== 'string' || !store.activateProfile(body.id))
      return json(res, 404, {
        error: 'Profile not found. Reopen Settings and choose a listed profile.',
      });
    return json(res, 200, profiles());
  }
  if (url.pathname === '/api/settings/tutor-style') {
    if (body?.style !== null && typeof body?.style !== 'string')
      return json(res, 400, {
        error: 'Send the tutor style as text, or null to restore the default.',
      });
    // Empty or default-equal text stores null so an unedited style follows later defaults.
    const text = body.style?.trim() || null;
    store.saveTutorStyle(text === DEFAULT_TUTOR_STYLE ? null : text);
    return json(res, 200, { style: store.tutorStyle(), default: DEFAULT_TUTOR_STYLE });
  }
  if (url.pathname === '/api/settings/chat') {
    const selection = {
      provider: body?.provider,
      model: body?.model,
      effort: body?.effort ?? null,
    };
    const invalid = await selectionError(selection);
    if (invalid) return json(res, invalid.status, { error: invalid.error });
    return json(res, 200, store.saveChatSettings(selection));
  }
  if (url.pathname === '/api/settings/smart') {
    const has = (key) => Object.hasOwn(body ?? {}, key),
      saved = store.smartSettings();
    if (
      (!has('model') && !has('followEffort')) ||
      (has('followEffort') && typeof body.followEffort !== 'boolean') ||
      (body.followEffort === false && body.effort !== null && typeof body.effort !== 'string')
    )
      return json(res, 400, { error: 'Choose a smart model or effort.' });
    const next = {
      model: has('model')
        ? body.model && { provider: body.model.provider, model: body.model.model }
        : saved.model,
      followEffort: has('followEffort') ? body.followEffort : saved.followEffort,
      effort: has('followEffort') ? (body.effort ?? null) : saved.effort,
    };
    // Only the pinned fields being saved are checked; followed chat values are validated where chat saves them.
    if (
      (has('model') && next.model) ||
      (has('followEffort') && !next.followEffort && next.effort !== null)
    ) {
      const chat = chatDefault(),
        provider = next.model?.provider ?? chat.provider;
      let model = next.model?.model ?? chat.model;
      try {
        model ??= await ctx.providers[provider]?.model?.({ model: null, thread: null });
      } catch {}
      const invalid = await selectionError({
        provider,
        model,
        effort: next.followEffort ? null : next.effort,
      });
      if (invalid) return json(res, invalid.status, { error: invalid.error });
    }
    store.saveSmartSettings(next);
    return json(res, 200, smart());
  }
  if (url.pathname === '/api/settings/suggestions') {
    const has = (key) => Object.hasOwn(body ?? {}, key),
      settings = store.suggestionSettings();
    if (
      (!has('enabled') && !has('model') && !has('effort')) ||
      (has('enabled') && typeof body.enabled !== 'boolean')
    )
      return json(res, 400, { error: 'Choose whether automatic suggestions are on or off.' });
    const model = has('model')
      ? body.model && { provider: body.model.provider, model: body.model.model }
      : settings.model;
    // A new model drops the old effort unless one is sent; the unset default model has no effort to choose.
    const effort = has('effort') ? body.effort : has('model') ? null : settings.effort;
    if (!model && effort !== null)
      return json(res, 400, {
        error: 'Choose a quick thinking model before choosing its effort.',
      });
    if (model && (has('model') || has('effort'))) {
      const invalid = await selectionError({ ...model, effort });
      if (invalid) return json(res, invalid.status, { error: invalid.error });
    }
    return json(
      res,
      200,
      store.saveSuggestionSettings({
        enabled: has('enabled') ? body.enabled : settings.enabled,
        model,
        effort,
      }),
    );
  }
  if (
    endpoint &&
    [
      '/api/settings/endpoint',
      '/api/settings/endpoint/test',
      '/api/settings/endpoint/clear',
    ].includes(url.pathname)
  ) {
    if (url.pathname.endsWith('/test')) {
      try {
        await endpoint.models();
        return json(res, 200, endpoint.status());
      } catch (error) {
        return json(res, 502, { error: error.message });
      }
    }
    try {
      const status = url.pathname.endsWith('/clear') ? endpoint.clear() : endpoint.save(body);
      if (url.pathname.endsWith('/clear')) {
        store.forgetEfforts('openai');
        store.forgetModels('openai');
      }
      ctx.syncEndpoints();
      return json(res, 200, status);
    } catch {
      return json(res, 400, {
        error:
          'Endpoint settings could not be saved. Check the HTTP(S) base URL, API key and local data-directory write access.',
      });
    }
  }
  // Reads images for one model of a saved endpoint; the override survives until the endpoint is removed.
  if (endpoint && url.pathname === '/api/settings/endpoints/model') {
    const { id, model, readsImages } = body ?? {};
    if (
      !endpoint.list().some((e) => e.id === id) ||
      typeof model !== 'string' ||
      !model.trim() ||
      model.length > 500 ||
      typeof readsImages !== 'boolean'
    )
      return json(res, 400, {
        error: 'Choose a model of a saved endpoint, then try again.',
      });
    store.setReadsImages(id, model, readsImages);
    return json(res, 200, { id, model, readsImages });
  }
  if (
    endpoint &&
    [
      '/api/settings/endpoints',
      '/api/settings/endpoints/remove',
      '/api/settings/endpoints/edit',
      '/api/settings/endpoints/test',
    ].includes(url.pathname)
  ) {
    try {
      const action = url.pathname.split('/')[4];
      const list =
        action === 'remove'
          ? endpoint.remove(body?.id)
          : action === 'edit'
            ? endpoint.edit(body ?? {})
            : action === 'test'
              ? await endpoint.test(body?.id)
              : endpoint.add(body ?? {});
      // remove throws for an unknown id, so its typed efforts go only with a deleted endpoint.
      if (action === 'remove') {
        store.forgetEfforts(body.id);
        store.forgetModels(body.id);
      }
      ctx.syncEndpoints();
      return json(res, 200, list);
    } catch (error) {
      return json(res, 400, {
        error:
          error instanceof EndpointError
            ? error.message
            : 'Endpoint settings could not be saved. Check local data-directory write access.',
      });
    }
  }
  return false;
}
