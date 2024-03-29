(function() {
	var FZ_GLOBAL_OBJECT_ID = 0;
	var scopesByModel = {};
	var scopesByPath = {};
	
	var debugMode = false;
	
	var rootScope = null;
	var bid = 1;
	
	const bindings = {};
	const templates = {};
	const launchers = {};
	
	/**
	 * Binding id calculation
	 */
	function nextBid() {
		const result = 'fz-' + bid;
		bid++;
		return result;
	}	
	
	
	function $eval(m, prop, lax) {
		if ((m === undefined) || (m === null)) {
			return undefined;
		}
		let path = prop.split('.');
		let result = m;
		let model, p, i = 0;
		
		while ((i < path.length)
				&& ((typeof result[path[i]] !== 'undefined') || (lax && (i == path.length - 1)))) {
			model = result;
			p = path[i];
			result = result[path[i]];
			if (('function' == typeof result) && (i < path.length - 1)) {
				result = result.call(model);
			}

			if ((result === undefined || result === null)
					&& !(lax && (i == path.length - 1))) {
				break;
			}
			i++;
		}

		if (i < path.length) {
			return undefined;
		}

		return {
			model : model,
			value : result,
			property : p
		};
	}
	
	/**
	 * Setting scope object property value
	 */
	function setModelValue(scope, property, value) {
		let prop = resolveProperty(scope, property);
		let m = prop[0].getModel(true);
		let p = prop[1];
		if (('undefined' !== typeof m) && (m != null)) {
			prop = $eval(m, p, true);
			if (typeof prop !== 'undefined') {
				let m1 = prop.model;
				let propv = prop.value;
				prop = prop.property;

				if ('function' == typeof propv) {
					propv.apply(m1, [ value ]);
				} else {
					if ((typeof propv == 'number')
							&& (typeof value == 'string')) {
						let tmpv = parseFloat(value);
						if (!isNaN(tmpv)) {
							if (isFinite(value)) {
								tmpv = parseInt(value, 10);
							}
							value = tmpv;
						}
					}
					m1[prop] = value;
				}
				scope.redraw();
			}
		}
	}
	
	/**
	 * 
	 */
	function eventHandler(event) {
		let args = [];
		if (arguments.length > 1) {
			args = Array.prototype.slice.call(arguments, 1);
		}

		try {
			evaluate(
				event.data.scope,
				event.data.handler,
				$(this),
				event,
				args.length ? args : undefined
			);
		} catch (err) {
			console.error(err);
		}
		return !event.isDefaultPrevented();
	}
	
	function parseArgs(scope, argsSrc) {
		if (!argsSrc) {
			return [];
		}
		let colonPos, arg = '', i = 0, result = [], start = 0;
		do {
			colonPos = argsSrc.indexOf(',', start);
			let openBracketPos = argsSrc.indexOf('(', start);
			if ((openBracketPos > -1) && (openBracketPos < colonPos)) {
				let closeBracketPos;
				let open = 1;
				let bp = openBracketPos + 1;
				while (open > 0) {
					closeBracketPos = argsSrc.indexOf(')', bp);
					openBracketPos = argsSrc.indexOf('(', bp);

					if ((closeBracketPos > -1) || (openBracketPos > -1)) {
						if ((closeBracketPos > -1)
								&& ((closeBracketPos < openBracketPos) || (openBracketPos < 0))) {
							open--;
							bp = closeBracketPos + 1;
						}

						if ((openBracketPos > -1)
								&& (closeBracketPos > openBracketPos)) {
							open++;
							bp = openBracketPos + 1;
						}
					} else {
						throw new Error('syntax error in expression "'
								+ argsSrc + '": bracket not closed');
						break;
					}
				}
				result[i] = evaluate(
					scope,
					argsSrc.substring(start, closeBracketPos + 1).trim()
				);
				colonPos = argsSrc.indexOf(',', closeBracketPos + 1);
			} else if (colonPos > -1) {
				result[i] = evaluate(
					scope,
					argsSrc.substring(start, colonPos).trim()
				);
			} else {
				result[i] = evaluate(scope, argsSrc.substring(start).trim());
			}
			start = colonPos + 1;
			i++;
		} while (colonPos > -1);
		return result;
	}
	
	/**
	 * Clear scope bindings
	 */
	function clearScope (scope, self) {
		scope.children.forEach(ch => clearScope(ch, true));
		scope.children.length = 0;

		if (self === true) {
			for (let i = 0; i < scope.bindings.length; i++) {
				let bid = $(scope.bindings[i].domElement).attr('fz-bid');
				delete scope.bindings[i].domElement;
				delete scope.bindings[i].scope;
				delete bindings[bid];
			}
			scope.bindings.length = 0;
			delete scope.parent;
			delete scopesByPath[scope.path];
			if (
				scope.model && typeof scope.model == 'object' &&
				(typeof scope.model.__fzUniqueId == 'function') &&
				'undefined' != typeof scopesByModel[scope.model.__fzUniqueId()]
			) {
				delete scopesByModel[scope.model.__fzUniqueId()][scope.path];
			}
		}
	}

	function resolveProperty(scope, property) {
		if (property.substring(0, 2) == '^.') {
			return resolveProperty(scope.parent, property.slice(2));
		}
		let root;
		if (property.substring(0, 2) == '$.') {
			property = property.slice(2);
			root = rootScope;
		} else {
			root = scope;
		}
		return [ root, property ];
	};
	
	function redrawModel(model, exclude, options, debug) {
		try {
			if (model) {
				exclude = exclude || {};
				if ('undefined' != typeof model.__fzUniqueId) {
					for (let pth in scopesByModel[model.__fzUniqueId()]) {
						if (!exclude[pth] && scopesByModel[model.__fzUniqueId()].hasOwnProperty(pth)) {
							let scope = scopesByModel[model.__fzUniqueId()][pth];
							scope.redraw(options, exclude);
						}
					}
				} else if (debug) {
					console.error(
						'Funchoza:' + model.constructor.name +
						' can not be redrawn because it was not binded yet!'
					);
				}
			}
		} catch (err) {
			console.error(err);
		}
	}	

	function evaluate(scope, property, domelement, event, sargs) {
		if (property == '@path') {
			return scope.path;
		}

		if (property == '@index') {
			let value = scope.path.substring(scope.path.lastIndexOf('.') + 1);
			if ($.isNumeric(value)) {
				return parseInt(value, 10);
			}
			return value;
		}

		if (property == '@scope') {
			return scope.getModel(true);
		}

		if ($.isNumeric(property)) {
			return property;
		}

		if ((property.indexOf('\'') == 0) || (property.indexOf('"') == 0) || (property.indexOf('`') == 0)) {
			return property.substring(1, property.length - 1);
		}

		if (property == 'true') {
			return true;
		}

		if (property == 'false') {
			return false;
		}

		let prop = resolveProperty(scope, property);
		let actScope = prop[0];
		let m = actScope.getModel(true);
		property = prop[1];
		let args;
		if (property.indexOf('(') > -1) {
			args = parseArgs(scope, property.substring(
					property.indexOf('(') + 1, property.lastIndexOf(')'))
					.trim());
			property = property.substring(0, property.indexOf('('));
			if (
				(args.length > 0) &&
				('undefined' != typeof Funchoza.funclib[property.trim()])
			)
				return Funchoza.funclib[property.trim()].apply(null, args);
		}

		if (('undefined' != typeof m) && (m != null)) {
			let value = $eval(m, property);
			if (typeof value !== 'undefined') {
				m = value.model;
				value = value.value;
			}
			
			if (debugMode && (typeof value === 'undefined')) {
				console.warn(
					'Funchoza apply: undefined value got for expression (' +
					m.constructor.name +
					')' + ((prop[0] === scope) ? scope.path : 'window') +
					'->' + property
				);
			}

			while ('function' == typeof value) {
				if ('undefined' == typeof args)
					args = [];

				if (sargs)
					args = args.concat(sargs);

				if (domelement)
					args.push(domelement);

				if (event)
					args.push(event);

				value = value.apply(m, args);
				args = [];
			}
			
			if (event && (value !== false)) {
				$.when(value).done(function () {
					let sm = scope.getModel(true);
					if ((sm !== m) && m)
						redrawModel(m, {[scope.path]: true});
					if (sm) {
						redrawModel(sm);
					}
				});		
			}
			return value;
		}
		return null;
	}
	
	function getControlValue(el) {
		if (!el.is('input')) {
			return el.val();
		}
		switch (el.attr('type')) {
			case 'radio': 
				let selected = $('input[name="' + el.attr('name') + '"][type=radio]:checked');
				return selected.length ? selected.val() : null;
				break;
			case 'checkbox': return el[0].checked;break;
			default: return el.val();break;
		}		
	}

	function cloneBinding(root, eb, element) {
		let el = element;

		if (eb.relativeIndex) {
			el = $(eb.relativeIndex, element);
		}

		const b = new fzBinding(root, el, eb.drawer);

		if ('undefined' != typeof eb.ifexpr) {
			b.ifexpr = eb.ifexpr;
		}

		if ('undefined' != typeof eb._tn) {
			b._tn = eb._tn;
		}

		if ('undefined' != typeof eb._gproperty) {
			b._gproperty = eb._gproperty;
		}

		if ('undefined' != typeof eb._sproperty) {
			b._sproperty = eb._sproperty;
			if (b._tn === 'select' || b._tn === 'textarea' || b._tn == 'input') {
				el.change(function () {
					setModelValue(
						root,
						b._sproperty,
						getControlValue($(this))
					);
				});
			}
		}

		if ('undefined' != typeof eb._styles) {
			b._styles = eb._styles;
			b._prevStyles = {};
		}

		if ('undefined' != typeof eb._attrs) {
			b._attrs = eb._attrs;
			b._prevAttrs = {};
		}

		if ('undefined' != typeof eb._classes) {
			b._classes = eb._classes;
			b._prevClasses = {};
		}

		if ('undefined' != typeof eb._events) {
			for (let j = 0; j < eb._events.length; j++) {
				el.unbind(eb._events[j].event, eventHandler);
				el.bind(
					eb._events[j].event,
					{
						scope : root,
						handler : eb._events[j].handler
					},
					eventHandler
				);
			}
		}

		if ('undefined' != typeof eb.elementTemplate) {
			b.elementTemplate = eb.elementTemplate;
		}

		const bid = nextBid();
		el.attr('fz-bid', bid);

		for (let i = 0; i < eb.childBindings.length; i++) {
			b.childBindings.push(cloneBinding(root, eb.childBindings[i], element));
		}

		bindings[bid] = b;

		return b;
	}

	function cloneScopeAndBindings(element, path, srcScope, parentScope, cycleContext) {
		const result = $(element);

		let root = scopesByPath[path];

		if ('undefined' == typeof root) {
			root = new fzScope(
				path,
				parentScope,
				srcScope.reactOnParent,
				srcScope.reactOnChildren,
				element
			);
			scopesByPath[path] = root;
			parentScope.addChild(root);
		}
		
		srcScope.bindings.forEach((b) => {
			if (
				(typeof b.relativeIndex != 'undefined') &&
				(!cycleContext || !b.cycleContext || b.cycleContext == cycleContext)
			) {
				root.addBinding(cloneBinding(root, b, result));
			}			
		});
		
		if (!srcScope.colScope) {
			srcScope.children.forEach(
				ch => cloneScopeAndBindings(
					element,
					path + ch.path.substring(srcScope.path.length),
					ch,
					root,
					cycleContext
				)
			);
		}
		return result;
	};
	
	function indexer(root, el) {
		const result = [];

		while (el !== root) {
			result.push('>:nth-child(' + ($(el).parent().children().index(el) + 1) + ')');
			el = $(el).parent()[0];
		}
		return result.reverse().join('');
	};
	
	function drawer(options) {
		return function () {
			if (!this.beforeRedraw().isDefaultPrevented()) {
				if (options.applyValue) {
					this.applyValue(options.forceText);
				}
			
				if (options.applyStyles) {
					this.applyStyles();
				}
			
				if (options.applyAttrs) {
					this.applyAttrs();
				}
			
				if (options.applyClasses) {
					this.applyClasses();
				}
				this.afterRedraw();
			}
		};
	}

	function bind(element, scopePath, parentScope, cloneMode, cycleContext) {
		let result = $(element);
		let root;
		
		function binder() {
			const me = $(this);

			let scope_path = [];
			let abs_scope = false;

			let react_parent, react_child;
			
			if ('undefined' != typeof me.attr('fz-watch-parent')) {
				react_parent = me.attr('fz-watch-parent') == 'true';
			}

			if ('undefined' != typeof me.attr('fz-watch-children')) {
				react_child = me.attr('fz-watch-children') == 'true';
			}

			if ('undefined' != typeof me.attr('fz-scope')) {
				scope_path = me.attr('fz-scope').split('.');

				if (scope_path[0] === '$') {
					scope_path.shift();
					abs_scope = true;
				}
			}

			if (!abs_scope && !me.is(element)) {
				me.parentsUntil(element, '[fz-scope]').each(
					function () {
						const sce = $(this);
						const p = sce.attr('fz-scope').split('.');
						if (p[0] === '$') {
							abs_scope = true;
							p.shift();
						}
						scope_path = p.concat(scope_path);
						return !abs_scope;
					}
				);
			}

			let pth = root.path;
			if (scope_path.length > 0) {
				pth = ((root.path == '') ? '' : (root.path + '.')) + scope_path.join('.');
				pth = pth.split('.');
				let i = 0;
				while (i < pth.length) {
					if (pth[i] == '^') {
						pth.splice(i - 1, 2);
					} else {
						i++;
					}
				}
				pth = pth.join('.');
			}
			
			let ps = root;
			if ('undefined' != typeof scopesByPath[pth]) {
				ps = scopesByPath[pth];
			} else {
				scope_path = pth.split('.');
				for (let i = 0; i < scope_path.length; i++) {
					pth = scope_path.slice(0, i + 1).join('.');
					if ('undefined' == typeof scopesByPath[pth]) {
						s = new fzScope(
							pth,
							ps,
							('undefined' != typeof react_parent && i == scope_path.length - 1) ? react_parent : true,
							('undefined' != typeof react_child && i == scope_path.length - 1) ? react_child : false,
							this
						);
						ps.addChild(s);
						scopesByPath[pth] = s;
						ps = s;
						ps.getModel(true);
					} else {
						ps = scopesByPath[pth];
					}
				}
			}

			const redrawOpts = {};
			if ('undefined' != typeof me.attr('fz-tpl')) {
				let tplval = me.attr('fz-tpl');
				if ('undefined' == typeof templates[tplval]) {
					let tpldomel = $('#' + tplval);
					if (tpldomel.length > 0) {
						templates[tplval] = tpldomel.html().trim();
						tpldomel.remove();
					} else
						console.error('template not found');
					/*
					 * $.ajax({ url:tplval+'.html', dataType:'html',
					 * success:function(data){ templates[tplval] =
					 * data.trim(); }, async: false });
					 */
				}

				if ('undefined' != typeof templates[tplval]) {
					let tmp = $($.parseHTML(templates[tplval]));
					if ('undefined' != typeof me.attr('fz-sp')) {
						tmp.attr('fz-sp', me.attr('fz-sp'));
					}

					me.replaceWith(tmp);
					return {root: ps, element: bind(tmp, pth, ps, cloneMode)[0]};
				}
			} else {
				let bindexpr = '';

				if ('undefined' != typeof me.attr('fz-bind'))
					bindexpr = me.attr('fz-bind');

				let doBind = false;
				let ifexpr, _tn, _sproperty, _gproperty, _gforcetxt, _styles, _attrs, _classes, _events;

				if ('undefined' != typeof me.attr('fz-if')) {
					ifexpr = me.attr('fz-if');
					doBind = true;
				}

				if (
					('undefined' != typeof me.attr('fz-data')) ||
					('undefined' != typeof me.attr('fz-html')) ||
					('undefined' != typeof me.attr('fz-get')) ||
					('undefined' != typeof me.attr('fz-set'))
				) {
					_tn = me.get(0).tagName.toLowerCase();
					if (('undefined' != typeof me.attr('fz-set'))
							|| bindexpr.indexOf('read') == -1
							|| bindexpr.indexOf('data') > -1
							|| bindexpr.indexOf('write') > -1) {
						_sproperty = me.attr('fz-set')
								|| me.attr('fz-data');
					}

					if (
						('undefined' != typeof me.attr('fz-get') || 'undefined' != typeof me.attr('fz-html')) ||
						bindexpr.indexOf('write') == -1 ||
						bindexpr.indexOf('read') > -1 ||
						bindexpr.indexOf('data') > -1
					) {
						_gproperty = me.attr('fz-html') || me.attr('fz-get') || me.attr('fz-data');
						_gforcetxt = ('undefined' == typeof me.attr('fz-html'));
					}

					if (_sproperty) {
						if (_tn === 'select' || _tn === 'textarea' || _tn == 'input') {
							me.change(function () {
								setModelValue(
									ps,
									_sproperty,
									getControlValue($(this))
								);
							});
						}
					}

					if (_gproperty) {
						redrawOpts.applyValue = true;
						redrawOpts.forceText = _gforcetxt;
					}
					doBind = true;
				}

				if ('undefined' != typeof me.attr('fz-style')) {
					redrawOpts.applyStyles = true;
					let styles = me.attr('fz-style').split(';');
					_styles = {};
					styles.forEach((style) => {
						style = style.split(':');
						if (style.length > 1) {
							_styles[style[0].trim()] = style[1].trim();
						}
					});
					doBind = true;
				}

				if ('undefined' != typeof me.attr('fz-attrs')) {
					redrawOpts.applyAttrs = true;
					const attrs = me.attr('fz-attrs').split(';');
					_attrs = {};
					attrs.forEach((attr) => {
						attr = attr.split(':');
						if (attr.length > 1)
							_attrs[attr[0].trim()] = attr[1].trim();
					});
					doBind = true;
				}

				if ('undefined' != typeof me.attr('fz-classes')) {
					redrawOpts.applyClasses = true;
					const classes = me.attr('fz-classes').split(';');
					_classes = {};
					classes.forEach((c) => {
						c = c.split(':');
						if (c.length > 1)
							_classes[c[0].trim()] = c[1].trim();						
					});
					doBind = true;
				}

				if ('undefined' != typeof me.attr('fz-handlers')) {
					const events = me.attr('fz-handlers').split(';');

					if (cloneMode) {
						_events = [];
						doBind = true;
					}
					
					events.forEach((e) => {
						e = e.split(':');
						if (e.length > 1) {
							if (typeof _events != 'undefined') {
								_events.push({
									event : e[0].trim(),
									handler : e[1].trim()
								});
							}
							me.unbind(e[0].trim(), eventHandler);
							me.bind(
								e[0].trim(),
								{
									scope : ps,
									handler : e[1].trim()
								},
								eventHandler
							);
						}						
					});
				}

				if (doBind) {
					b = new fzBinding(ps, me, drawer(redrawOpts));

					if ('undefined' != typeof ifexpr)
						b.ifexpr = ifexpr;

					if ('undefined' != typeof _tn)
						b._tn = _tn;

					if ('undefined' != typeof _gproperty) {
						b._gproperty = _gproperty;
					}

					if ('undefined' != typeof _sproperty) {
						b._sproperty = _sproperty;
					}

					if ('undefined' != typeof _styles) {
						b._styles = _styles;
						b._prevStyles = {};
					}

					if ('undefined' != typeof _attrs) {
						b._attrs = _attrs;
						b._prevAttrs = {};
					}

					if ('undefined' != typeof _classes) {
						b._classes = _classes;
						b._prevClasses = {};
					}

					if ('undefined' != typeof _events)
						b._events = _events;

					ps.addBinding(b);

					const bid = nextBid();
					me.attr('fz-bid', bid);
					bindings[bid] = b;
					if (cloneMode) {
						b.relativeIndex = indexer(result[0], this);
						b.cycleContext = cycleContext;
					}
				}

				if ('undefined' != typeof me.attr('fz-foreach')) {
					let property = resolveProperty(ps, me.attr('fz-foreach'));
					let fepath = property[0].path + (property[0].path ? '.' : '') + property[1];
					let colScope;
					if ('undefined' != typeof scopesByPath[fepath])
						colScope = scopesByPath[fepath];
					else {
						colScope = new fzScope(
								fepath,
								ps,
								('undefined' != typeof react_parent) ? react_parent : true,
								('undefined' != typeof react_child) ? react_child : false,
								this
						);
						colScope.colScope = true;
						ps.addChild(colScope);
						scopesByPath[colScope.path] = colScope;
					}

					let colTpl = '';
					
					let tmp = $.parseHTML(me.html().trim());
					if (tmp && tmp.length > 0) {
						colTpl = tmp[0];
					}

					me.html('');

					let cb = new fzBinding(colScope, me, function () {this.applyForeach();});
					cb.elementTemplate = colTpl;
					colScope.addBinding(cb);
					if (cloneMode) {
						cb.relativeIndex = indexer(result[0], this);
					}

					// TODO Допилить - сейчас если на форич накладываются
					// другие биндинги,
					// при вызове обновления по элементу не будет вызвана
					// отрисовка содержимого
					if ('undefined' == typeof b) {
						const bid = nextBid();
						me.attr('fz-bid', bid);
						bindings[bid] = cb;
					}
				}
			}
			return {root: ps, element: this};
		}		

		if (scopePath == null) {
			root = rootScope;
		} else {
			root = scopesByPath[scopePath];
			if ('undefined' == typeof root) {
				let rp, rc;
				if ('undefined' != typeof result.attr('fz-watch-parent')) {
					rp = Boolean(result.attr('fz-watch-parent'));
				}

				if ('undefined' != typeof result.attr('fz-watch-children')) {
					rc = Boolean(result.attr('fz-watch-children'));
				}				
				
				root = new fzScope(
						scopePath,
						parentScope,
						(rp !== undefined) ? rp : true,
						(rc !== undefined) ? rc : false,
						element
				);
				
				scopesByPath[scopePath] = root;
				if (parentScope) {
					parentScope.addChild(root);
				}
			}
		}

		selector = '[fz-scope],[fz-bind],[fz-data],[fz-set],[fz-get],[fz-html],[fz-style],[fz-classes],[fz-handlers],[fz-foreach],[fz-tpl],[fz-attrs],[fz-if]';

		if (result.is(selector)) {
			let res = binder.apply(result[0]);
			result = $(res.element);
			if (res.root !== root) {
				root = res.root;
			}
		}
		$(selector, result).not($('template, [fz-foreach]', result).find(selector)).each(binder);
		return result;
	};
	
	/*
	 * Класс связки между выражением скоупом и элементом DOM
	 */
	function fzBinding(scope, element, drawer) {
		this.scope = scope;
		this.domElement = element;
		this.drawer = drawer;
		this.elementTemplate = '';
		this.childBindings = [];

		const redraw = (function() {
			if ($(this.domElement).closest('.fz-hidden-by-if').not(this.domElement).length == 0) {
				if (this.ifexpr) {
					let v = evaluate(this.scope, this.ifexpr);

					if (this.domElement) {
						if (v) {
							$(this.domElement).removeClass('fz-hidden-by-if');
						} else {
							$(this.domElement).addClass('fz-hidden-by-if');
						}
					}

					if (!v) {
						return false;
					}
				}

				this.drawer();
				return true;
			}

			return false;
		}).bind(this);

		let prev;

		this.applyValue = function(mode) {
			if ('undefined' != typeof this._gproperty) {
				let value = evaluate(this.scope, this._gproperty);
				if (value !== prev) {
					prev = value;
					if (this._tn == 'input' || this._tn == 'select'
							|| this._tn == 'textarea') {
						if (this.domElement.attr('type') == 'checkbox') {
							this.domElement[0].checked = value ? true : false;
						} else if (this.domElement.attr('type') == 'radio') {
							$('input[type=radio][name="' + this.domElement.attr('name') + '"]')
								.each(function () {this.checked = false;});
							if (typeof value != 'undefined') {
								let vel = $('input[type=radio][name="' + this.domElement.attr('name') + '"][value="' + value + '"]');
								if (vel.length) {
									vel[0].checked = true;
								}
							}
						} else {
							this.domElement.val((typeof value == 'undefined') ? '' : value);
						}
					} else if ('undefined' == typeof this.domElement.attr('fz-foreach')) {
						if (mode) {
							this.domElement.text((typeof value == 'undefined') ? '' : value);
						} else {
							this.domElement.html((typeof value == 'undefined') ? '' : value);
						}
					}
				}
			}
		};

		const prevStyles = {};

		this.applyStyles = function() {
			if ('undefined' != typeof this._styles) {
				for (style in this._styles) {
					if (this._styles.hasOwnProperty(style)) {
						let newStyle = evaluate(this.scope, this._styles[style]);
						let oldStyle = prevStyles[style];
						if (oldStyle != newStyle) {
							prevStyles[style] = newStyle;
							this.domElement.css(style, newStyle);
						}
					}
				}
			}
		};

		const prevAttrs = {};

		this.applyAttrs = function() {
			if ('undefined' != typeof this._attrs) {
				for (attr in this._attrs) {
					if (this._attrs.hasOwnProperty(attr)) {
						let newAttr = evaluate(this.scope, this._attrs[attr]);
						let oldAttr = prevAttrs[attr];
						if (oldAttr != newAttr) {
							prevAttrs[attr] = newAttr;
							this.domElement.attr(attr, newAttr);
						}
					}
				}
			}
		};

		const prevClasses = {};

		this.applyClasses = function() {
			if ('undefined' != typeof this._classes) {
				for (c in this._classes) {
					if (this._classes.hasOwnProperty(c)) {
						let v = evaluate(this.scope, this._classes[c]);
						if (v !== prevClasses[c]) {
							prevClasses[c] = v;
							if (v) {
								this.domElement.addClass(c);
							} else {
								this.domElement.removeClass(c);
							}
						}
					}
				}
			}
		};

		this.applyForeach = function() {
			let value = this.scope.getModel(true);
			let colScope = this.scope;
			
			if (!$.isArray(value) || value.length == 0) {
				clearScope(colScope, false);
				this.domElement.html('');
			}			
			
			if (('undefined' == typeof value) || (value == null) || (value.length == 0)) {
				return;
			}
			
			append = [];
			
			const colItemCreator = (chpth, isFirst, i) => {
				let n;
				if (isFirst) {
					n = bind(
						$(this.elementTemplate).clone(),
						chpth,
						colScope,
						true,
						this.domElement.attr('fz-bid')
					);
					append.push(n[0]);
				} else {
					n = $(append[0]).clone();
					append.push(
						cloneScopeAndBindings(
							n,
							chpth,
							colScope.children[0],
							colScope,
							this.domElement.attr('fz-bid')
						)[0]
					);
				}
				n.attr('fz-sp', i);			
			};			
			
			if ($.isArray(value)) {
				let oldlength = this.domElement.children().length;
				if (oldlength > value.length) {
					for (let i = 0; i < oldlength; i++) {
						if (i < value.length) {
							colScope.children[i].getModel(true);
						} else {
							clearScope(colScope.children[i], true);
						}
					}
					colScope.children = colScope.children.slice(0, value.length);
				}

				this.domElement.children(':gt(' + (value.length - 1) + ')').remove();

				for (let i = oldlength; i < value.length; i++) {
					colItemCreator(colScope.path + '.' + i, i == oldlength, i);
				}
			} else {
				let i = 0;
				for (let nm in value) {
					if (value.hasOwnProperty(nm) && nm !== '__fzUniqueId' && nm !== '__fz__uid') {
						colItemCreator(colScope.path + '.' + nm, i == 0, nm);
					}
				}
			}

			if (append.length > 0) {
				this.domElement.append(append);
			}			
		};

		this.beforeRedraw = function() {
			const e = jQuery.Event('beforeRedraw.funchoza', {
				binding : this,
				model : this.scope.getModel(true)
			});
			$(this.domElement).trigger(e);
			return e;
		};

		this.afterRedraw = function() {
			const e = jQuery.Event('afterRedraw.funchoza', {
				binding : this,
				model : this.scope.getModel(true)
			});
			$(this.domElement).trigger(e);
			return e;
		};
		
		this.addChild = function(b) {
			for (let i = 0; i < this.childBindings.length; i++) {
				if (this.childBindings[i].addChild(b)) {
					return true;
				}
			}

			if (b.domElement.closest(this.domElement).length > 0) {
				this.childBindings.push(b);
				return true;
			}

			return false;
		};

		this.redraw = function() {
			if (redraw()) {
				for (let i = 0; i < this.childBindings.length; i++) {
					this.childBindings[i].redraw();
				}
			}
		};
	}
	
	/**
	 * @param {fzScope} scope
	 * @param {{}} [exclude]
	 * @param {{}} [options]
	 * @param {Boolean} [options.children]
	 * @param {Boolean} [options.branch]
	 * @param {Boolean} [options.parent]
	 * @param {Boolean} [options.toRoot]
	 */
	function redraw(scope, exclude, options) {
		options = options || {};
		if (options.children === undefined) {
			options.children = true;
		}
		
		if (options.parent === undefined) {
			options.parent = true;
		}		
		
		// scope.getModel(true);

		for (let i = 0; i < scope.bindings.length; i++) {
			scope.bindings[i].redraw();
		}
		
		exclude = exclude || {};
		exclude[scope.path] = true;
		
		if (scope.parent != null &&
			(options.parent && scope.parent.reactOnChildren === true || options.toRoot) &&
			!exclude[scope.parent.path]
		) {
			let m = scope.parent.getModel();
			redrawModel(scope.parent.getModel(!(m && m.___fzUniqueId)), exclude, {toRoot: options.toRoot});
		}
		
		if (options.children || options.branch) {
			for (let i = 0; i < scope.children.length; i++) {
				if (
					(scope.children[i].reactOnParent === true || options.branch || scope.colScope) &&
					!exclude[scope.children[i].path]
				) {
					let m = scope.children[i].getModel();
					redrawModel(scope.children[i].getModel(!(m && m.___fzUniqueId)), exclude, {parent: false, children: true, branch: options.branch});
				}
			}
		}
	}

	function fzScope(path, parent, react_parent, react_children, el) {
		this.parent = parent;
		this.reactOnParent = react_parent;
		this.reactOnChildren = react_children;
		this.colScope = false;
		this.children = [];
		this.bindings = [];
		this.path = path;
		this.element = el;

		/*
		 * Вычисление объекта для которого создан скоуп + размещение ссылки на
		 * скоуп в scopesByModel
		 */
		this.getModel = function (forceReload) {
			let init = false;
			if (('undefined' == typeof this.model) || forceReload) {
				let m = window;
				if (this.path !== '') {
					m = $eval(window, this.path);
					if (m != undefined) {
						if ('function' == typeof m.value) {
							m = m.value.call(m.model);
						} else {
							m = m.value;
						}
					}
				}

				if ('undefined' == typeof m) {
					delete this.model;
					if (debugMode) {
						console.warn('Funchoza: got undefined model for scope path ' + this.path);
					}
					return m;
				}

				if ('object' != typeof m) {
					throw new Error('can not use scalar value "' + m + '" as model for path ' + this.path);
				}
				
				if (m && ('undefined' == typeof m.__fzUniqueId)) {
					m.__fzUniqueId = (function() {
						if ('undefined' == typeof this.__fz__uid) {
							this.__fz__uid = FZ_GLOBAL_OBJECT_ID;
							FZ_GLOBAL_OBJECT_ID++;
						}
						return this.__fz__uid;
					}).bind(m);					
				}

				if (this.model && this.model !== m) {
					if (typeof scopesByModel[this.model.__fzUniqueId()] !== 'undefined') {
						delete scopesByModel[this.model.__fzUniqueId()][this.path];
						let empty = true;
						for (let pth in scopesByModel[this.model.__fzUniqueId()]) {
							if (scopesByModel[this.model.__fzUniqueId()].hasOwnProperty(pth)) {
								empty = false;
								break;
							}
						}
						if (empty) {
							delete scopesByModel[this.model.__fzUniqueId()];
						}
					}
				}

				this.model = m;
				
				if (this.model) {
					if (typeof scopesByModel[this.model.__fzUniqueId()] == 'undefined') {
						scopesByModel[this.model.__fzUniqueId()] = {};
					}
					scopesByModel[this.model.__fzUniqueId()][this.path] = this;
				}
			}

			return this.model;
		}

		this.addChild = function(scope) {
			this.children.push(scope);
		};

		this.addBinding = function(binding) {
			for (let i = 0; i < this.bindings.length; i++) {
				if (this.bindings[i].addChild(binding)) {
					return;
				}
			}

			this.bindings.push(binding);
		};

		/**
		 * @param {{}} [options]
		 * @param {Boolean} [options.children]
		 * @param {Boolean} [options.branch]
		 * @param {Boolean} [options.parent]
		 * @param {Boolean} [options.toRoot]
		 * @param {fzScope} [exclude]
		 */
		this.redraw = function(options, exclude) {
			if ($(this.element).closest('.fz-hidden-by-if').not(this.element).length == 0) {
				redraw(this, exclude || null, options || {});
			}
		};
	}
	
	function is(o, cn) {
		if (('object' == typeof o) && (o != null)) {
			if (cn == 'object')
				return true;
			if (o.constructor && o.constructor.name == cn)
				return true;
			if (o.constructor && o.constructor.name !== 'Object' && o.__proto__)
				return is(o.__proto__, cn);
		}
		return typeof o == cn;
	}

	const Funchoza = {
			
		debug: function (v) {
			debugMode = v;
		},
		
		bind: function (element, path) {
			let parentScope = null;
			if (path) {
				let parts = path.split('.');
				parts = parts.slice(0, parts.length - 1);
				if (scopesByPath[parts.join('.')]) {
					parentScope = scopesByPath[parts.join('.')];
				}
			}
			bind(element, path, parentScope);
		},

		redrawElement: function (element) {
			try {
				if (element) {
					bindings[$(element).attr('fz-bid')].redraw();
				} else {
					rootScope.redraw({branch: true});
				}
			} catch (err) {
				console.error(err);
			}
		},

		redraw: function (model, options) {
			if (model) {
				redrawModel(model, null, options, debugMode);
			} else {
				redraw(rootScope, null, options);
			}
		},

		launch: function (path, launcher) {
			if ('function' == typeof launcher) {
				launchers[path] = launcher;
			}
		},
		
		elementScope: function (e) {
			e = $(e);
			if (
        		e.attr('fz-bid') && 
        		bindings.hasOwnProperty(e.attr('fz-bid')) &&
        		bindings[e.attr('fz-bid')].scope.getModel()
        	){
				return bindings[e.attr('fz-bid')].scope.getModel();
			}
			return null;
		},
		
		funclib: {
			not : function(v) {
				return !v;
			},
			and : function(v1) {
				for (let i = 0; i < arguments.length; i++) {
					if (!arguments[i]) {
						return false;
					}
				}
				return true;
			},
			or : function(v1) {
				for (let i = 0; i < arguments.length; i++) {
					if (arguments[i]) {
						return true;
					}
				}
				return false;
			},
			'if' : function(v1, v2, v3) {
				return v1 ? v2 : v3;
			},
			eq : function(v1, v2) {
				return v1 == v2;
			},
			neq : function(v1, v2) {
				return v1 != v2;
			},
			lt : function(v1, v2) {
				return v1 < v2;
			},
			gt : function(v1, v2) {
				return v1 > v2;
			},
			lte : function(v1, v2) {
				return v1 <= v2;
			},
			gte : function(v1, v2) {
				return v1 >= v2;
			},
			is : is,
			concat : function() {
				let result = '';
				for (let i = 0; i < arguments.length; i++) {
					if (typeof arguments[i] != 'undefined' || arguments[i] != null) {
						result = result + arguments[i].toString();
					}
				}
				return result;
			},
			add : function() {
				let result = 0;
				for (let i = 0; i < arguments.length; i++) {
					if (arguments[i]) {
						result = result + parseInt(arguments[i]);
					}
				}
				return result;
			},
			sub : function(v1) {
				let result = arguments[0];
				for (let i = 1; i < arguments.length; i++) {
					if (arguments[i]) {
						result = result - parseInt(arguments[i]);
					}
				}
				return result;
			}
		}	
	};

	rootScope = new fzScope('', null, false, false, document.body);
	scopesByPath[''] = rootScope;
	rootScope.getModel(true);
	
	window.fz = Funchoza;
	
	$(document).ready(
		() => {
			$('<style type="text/css"> .fz-hidden-by-if { display:none !important; visibility: hidden !important; }</style>').appendTo('head');
			try {
				bind(window.document, null);
			} catch (err) {
				console.error(err);
			}
			rootScope.redraw({children: false, parent: false});
			rootScope.children.forEach((scope) => {
				try {
					if ('function' == typeof launchers[scope.path]) {
						let r = launchers[scope.path].call();
						if (r === true) {
							scope.redraw({branch: true});
						} else if (r && typeof r.then === 'function') {
							r.then(() => {
								scope.redraw({branch: true});
							});
						}
					} else {
						scope.redraw({branch: true});
					}
				} catch (err) {
					console.error(err);
				}
			});
		}
	);
})();