
/*
 * Класс связки между выражением скоупом и элементом DOM
 */	
function cvrBinding(scope, element, invalidator){
	this.scope = scope;
	this.domElement = element;
	this.invalidator = invalidator;
	this.elementTemplate = "";
	this.childBindings = [];
	
	this.addChild = function(b){
		var i;
		
		for (i = 0; i < this.childBindings.length; i++){
			if (this.childBindings[i].addChild(b))
				return true;
		}
		
		if (b.domElement.closest(this.domElement).length > 0){
			this.childBindings[this.childBindings.length] = b;
			return true;
		}
		
		return false;
	};
	
	this.__invalidate = function(){
		var v;
		if (this.ifexpr){
			v = caviar._evaluate(this.scope,this.ifexpr);
			
			if (this.domElement){
				if (v)
					$(this.domElement).removeClass("cvr-hidden-by-if");
				else
					$(this.domElement).addClass("cvr-hidden-by-if");
			}
				
			if (!v)
				return false;
		}
		
		if ($(this.domElement).closest(".cvr-hidden-by-if").length == 0){
			this.invalidator();	
			return true;
		}
		
		return false;
	}
	
	this.invalidateObservable = function(property, force){
		var i;
		if (force || this.observe && this.observe[property])
			this.__invalidate();
			
		for (i = 0; i < this.childBindings.length; i++){
			this.childBindings[i].invalidateObservable(property, force || this.observe && this.observe[property] && this.observe[property] == 'full');
		}
	}
	
	this.invalidate = function(){
		var i;
		
		if (this.__invalidate()){
			for (i = 0; i < this.childBindings.length; i++)
				this.childBindings[i].invalidate();
		}
	};
	
	this._applyValue = function(mode){
		var value;
		if (undefined != this._gproperty){
			value = caviar._evaluate(this.scope,this._gproperty);
			if (value !== this._prev){
				this._prev = value;
				if (this._tn == "input" || this._tn == "select" || this._tn == "textarea"){
					if (this.domElement.attr("type") == "checkbox"){
						this.domElement[0].checked = value?true:false;
					} else
						this.domElement.val((value == undefined)?"":value);
				} else if (undefined == this.domElement.attr("cvr-foreach")) {
					if (mode)
						this.domElement.text((value == undefined)?"":value);
					else
						this.domElement.html((value == undefined)?"":value);
				}
			}
		}
	};
	
	this._applyStyles = function(){
		var style, newStyle, oldStyle;
		if (undefined != this._styles){
			for (style in this._styles)
			if (undefined != style){
				newStyle = caviar._evaluate(this.scope,this._styles[style]);
				oldStyle = this._prevStyles[style];
				if (oldStyle != newStyle){
					this._prevStyles[style] = newStyle;
					this.domElement.css(style,newStyle);
				}
			}
		}
	};
	
	this._applyAttrs = function(){
		var attr, newAttr, oldAttr;
		if (undefined != this._attrs){
			for (attr in this._attrs)
				if (undefined != attr){
					newAttr = caviar._evaluate(this.scope,this._attrs[attr]);
					oldAttr = this._prevAttrs[attr];
					if (oldAttr != newAttr){
						this._prevAttrs[attr] = newAttr;
						this.domElement.attr(attr,newAttr);
					}
				}
		}
	};
	
	this._applyClasses = function(){
		var c, v;
		if (undefined !== this._classes){
			for (c in this._classes)
				if (undefined != c){
					v = caviar._evaluate(this.scope,this._classes[c]);
					if (v !== this._prevClasses[c]){
						this._prevClasses[c] = v;
						if (v)
							this.domElement.addClass(c);
						else
							this.domElement.removeClass(c);
					}
				}		
		}
	};
	
	this._applyForeach = function(){
		var value, colScope, i, n, chpth, oldlength, newScopeChildren, append;
		value = this.scope.getModel(true);
		colScope = this.scope;
		if ((undefined == value) || (value == null) || (value.length == 0)){
			caviar._clearScope(colScope, false);
			this.domElement.html("");
		} else {
			oldlength = this.domElement.children().length;
			if (oldlength > value.length){
				newScopeChildren = [];
				for (i = 0; i < oldlength; i++){
					if (i < value.length){
						colScope.children[i].getModel(true);
					} else
						caviar._clearScope(colScope.children[i],true);
				}
				colScope.children = colScope.children.slice(0,value.length);
			}
			
			this.domElement.children(":gt(" + (value.length - 1) + ")").remove();			
			
			append = [];
			for (i = oldlength; i < value.length; i++) {
				chpth = colScope.path + "." + i;
				if (i == oldlength) {
					n = caviar.bind($(this.elementTemplate).clone(), chpth, colScope, true, this.domElement.attr('cvr-bid'));
					append.push(n[0]);
				} else {
					n = $(append[0]).clone();
					append.push(caviar.cloneScopeAndBindings(n, chpth, colScope.children[0], colScope, this.domElement.attr('cvr-bid'))[0]);
				}
				n.attr("cvr-sp", i);
			}
			
			if (append.length > 0){
				this.domElement.append(append);
			}
		}
	};
	
	this._beforeInvalidate = function(){
		var e = jQuery.Event("on-cvr-invalidate",{
			binding:this,
			model:this.scope.getModel(true)
		});
		$(this.domElement).trigger(e);
		return e;
	};
	
	this._afterInvalidate = function(){
		var e = jQuery.Event("post-cvr-invalidate",{
			binding:this,
			model:this.scope.getModel(true)
		});
		$(this.domElement).trigger(e);
		return e;
	};		
	
}

/*
 * Класс скоупа - элемента дерева выражений, каждый скоуп содержит 
 * биндинги (cvrBinding) на элементы DOM, а также дочерние скоупы 
 */	
function cvrScope(path, parent, react_parent, react_children){
	this.parent = parent;
	this.reactOnParent = react_parent;
	this.reactOnChildren = react_children;
	this.colScope = false;
	this.children = [];
	this.bindings = [];
	this.path = path;
	
	/*
	 * Вычисление объекта для которого создан скоуп
	 * + размещение ссылки на скоуп в scopesByModel
	 */		
	this.getModel = function(forceReload){
		var m, init = false;
		if ((undefined == this.model) || forceReload){
			m = window;
			if (this.path !== ""){
				m = caviar._eval(window,this.path);
				if (m != undefined){
					if ("function" == typeof m.value)
						m = m.value.call(m.model);
					else
						m = m.value;
				}
			}
			
			if (undefined == m){
				delete this.model;
				if (caviar.debugMode)
					console.warn("caviar: got undefined model for scope path "+this.path);
				return m;
			}
			
			if (("object" != typeof m) && ("array" != typeof m))
				throw new Error("can not use scalar value as model for path "+this.path);
			
			if (m && this.model && forceReload && (this.model !== m)){
				if ((undefined != this.model.__cvrUniqueId) && (undefined == m.__cvrUniqueId)) {
					if (undefined == m.__cvrUniqueId){
						m.__cvrUniqueId = this.model.__cvrUniqueId;
						m.__cvr__uid = this.model.__cvr__uid;
					} else {
						if (caviar.scopesByModel[this.model.__cvrUniqueId()] == undefined)
							delete caviar.scopesByModel[this.model.__cvrUniqueId()][this.path];
					}
				}
			}
			
			this.model = m;
		}
		
		if (undefined == this.model.__cvrUniqueId){
			this.model.__cvrUniqueId = function(){
				return (function(){
					if (undefined == this.__cvr__uid){
						this.__cvr__uid = caviar.CVR_GLOBAL_OBJECT_ID;
						caviar.CVR_GLOBAL_OBJECT_ID++;
					}
					return this.__cvr__uid;
				}).apply(m);
			};
			init = true;
		}
		
		if (init || forceReload){
			if (caviar.scopesByModel[this.model.__cvrUniqueId()] == undefined)
				caviar.scopesByModel[this.model.__cvrUniqueId()] = {};
			caviar.scopesByModel[this.model.__cvrUniqueId()][this.path] = this;
		}
		
		return this.model;			
	}

/*
 * Метод добавления дочернего скоупа
 */	
	this.addChild = function(scope){
		this.children[this.children.length] = scope; 
	};

/*
 * Метод добавления биндинга
 */	
	this.addBinding = function(binding){
		var i;
		for (i = 0; i < this.bindings.length; i++){
			if (this.bindings[i].addChild(binding))
				return;
		}
		
		this.bindings[this.bindings.length] = binding;
	};
	
/*
 * Метод обновления элементов DOM привязанных к скоупу.
 * Если invalidateParent = true, также выполняется рекурсивное обновление DOM элементов родительского скоупа, 
 * если у него выставлен флаг reactOnChildren, либо forceParent = true
 * Также выполняется рекурсивное обновление DOM элементов всех дочерних скоупов, 
 * у которых выставлен флаг reactOnParent, либо forceBranch = true
 */	
	this._invalidate = function(excludeChild, invalidateParent, forceParent, forceBranch){
		var i;
		this.getModel(true);

		for (i = 0; i < this.bindings.length; i++)
			this.bindings[i].invalidate();
		/*		
		if (invalidateParent && (this.parent != null)){
			if ((this.parent.reactOnChildren === true) || forceParent)
				this.parent._invalidate(this, true, false, false);
		}
		*/
		for (i = 0; i < this.children.length; i++) {
			if (((this.children[i].reactOnParent === true) || forceBranch) && (this.children[i] !== excludeChild)){
				this.children[i].invalidateBranch(forceBranch);
			}
		}
	};
	
	this.invalidateObservable = function(property){
		var i;
		for (i = 0; i < this.bindings.length; i++)
			this.bindings[i].invalidateObservable(property);		
	};
	
	this.invalidate = function(){
		this._invalidate(null,false,false,false);
	};
	
/*
 * Метод обновления элементов DOM привязанных к скоупу
 * с рекурсивным обновлением DOM элеменетов дочерних скоупов.
 * Если передан параметр force = true, обновление дочерних скоупов выполняется вне зависимости
 * от флага reactOnParent
 */	
	this.invalidateBranch = function(force){
		this._invalidate(null, false, false, force);
	};
}


function Caviar(){
	
	var event_handler = function(event){
		var args = [];
		if (arguments.length > 1){
			args = Array.prototype.slice.call(arguments, 1);
		}
		
		if (caviar._evaluate(
				event.data.scope,
				event.data.handler,
				$(this),
				event,
				function(){
					event.data.scope.invalidate();
				},
				args.length?args:undefined
			) !== false){
				event.data.scope.invalidate();
		}
		return !event.isDefaultPrevented();
	};
	
	this.CVR_GLOBAL_OBJECT_ID = 0;
	this.rootScope = null;
	this.id = 1;
	this.scopesByModel = {};
	this.scopesByPath = {};
	this.bindings = {};
	this.templates = {};
	this.launchers = {};
	this.debugMode = false;
	
	
	this.predicates = {
		not:function(v){return !v;},
		and:function(v1){
			var i;
			for (i = 0; i < arguments.length; i++){
				if (!arguments[i])
					return false;
			}
			return true;
		},
		or:function(v1){
			var i;
			for (i = 0; i < arguments.length; i++){
				if (arguments[i])
					return true;
			}
			return false;	
		},
		eq:function(v1, v2){
			return v1 == v2;
		},
		neq:function(v1, v2){
			return v1 != v2;
		},
		lt:function(v1, v2){
			return v1 < v2;
		},
		gt:function(v1, v2){
			return v1 > v2;
		},
		lte:function(v1, v2){
			return v1 <= v2;
		},
		gte:function(v1, v2){
			return v1 >= v2;
		},
		is:function(o, cn){
			if (("object" == typeof o) && (o != null))
				return o.constructor.name == cn;
			return false;
		},
		concat:function(){
			var i, result = "";
			for (i = 0; i < arguments.length; i++){
				if (typeof arguments[i] != "undefined" || arguments[i] != null){
					result = result + arguments[i].toString();
				}
			}
			return result;		
		},
		add:function(){
			var i, result = 0;
			for (i = 0; i < arguments.length; i++){
				if (arguments[i])
					result = result + parseInt(arguments[i]);
			}
			return result;		
		},
		sub:function(v1){
			var i, result = arguments[0];
			for (i = 1; i < arguments.length; i++){
				if (arguments[i])
					result = result - parseInt(arguments[i]);
			}
			return result;	
		}		
	};	
	
/*
 * Вычисление идентификатора биндинга
 */
	this._nextBid = function(){
		var bid = "cvr-" + this.id;
		this.id++;
		return bid;
	};
	
/*
 * Копируем cvr-идентификацию объекта в новый перед присвоением 
 */	
	this._cvrize = function(what, by){
		if (by.__cvrUniqueId) {
			what.__cvrUniqueId = by.__cvrUniqueId;
			what.__cvr__uid = by.__cvr__uid;
		}
		return what;
	};

/*
 * Обновление элемента DOM привязанного к скоупу
 */
	this.invalidateElement = function(element){
		if (element)
			this.bindings[$(element).attr("cvr-bid")].invalidate();
		else
			this.rootScope.invalidateBranch(true);
	};
	
/*
 * Обновление элементов DOM обозначенных как слушатели атрибута для скоупа привязанного к объекту
 * TODO по идее надо парсить property и для соответствующих вложенных скоупов вызывать рекурсивно обновление
 */	
	this.invalidateObservables = function(model, property){
		var pth;
		if (model){
			if (undefined != model.__cvrUniqueId){
				for (pth in this.scopesByModel[model.__cvrUniqueId()])
					if (pth != undefined){
						this.scopesByModel[model.__cvrUniqueId()][pth].invalidateObservable(property);
					}
			} else {
				if (this.debugMode)
					console.error("caviar:" + model.constructor.name + " can not be invalidated because it was not binded yet!");
			}
		} else
			this.rootScope.invalidateObservable(property);		
	};	
	
/*
 * Обновление элементов DOM для скоупа привязанного к объекту
 */	
	this.invalidate = function(model, force){
		var pth;
		if (model){
			if (undefined != model.__cvrUniqueId){
				for (pth in this.scopesByModel[model.__cvrUniqueId()])
					if (pth != undefined){
						this.scopesByModel[model.__cvrUniqueId()][pth].invalidateBranch((undefined != force)?force:true);
					}
			} else {
				if (this.debugMode)
					console.error("caviar:" + model.constructor.name + " can not be invalidated because it was not binded yet!");
			}
		} else
			this.rootScope.invalidateBranch(true);
	};
	
	this.launch = function(path, launcher){
		if ("function" == typeof launcher)
			this.launchers[path] = launcher;
	};
	
/*
 * Обновление элементов DOM для скоупа привязанного к выражению JS
	
	this.invalidatePath = function(path){
		if (!path)
			this.rootScope.invalidateBranch(true);
		else
			this.scopesByPath[path].invalidate();
	},
*/
	
/*
 * Сброс биндингов скоупа
 */	
	this._clearScope = function(scope, self){
		var i, bid;
		for (i = 0; i < scope.children.length; i++)
			this._clearScope(scope.children[i],true);
		
		scope.children.length = 0;

		if (self === true){
			for (i = 0; i < scope.bindings.length; i++){
				bid = $(scope.bindings[i].domElement).attr("cvr-bid");
				delete scope.bindings[i].domElement;
				delete scope.bindings[i].scope;
				delete this.bindings[bid];
			}
			scope.bindings.length = 0;
			delete scope.parent;
			delete this.scopesByPath[scope.path];
			if (undefined != scope.model && undefined != this.scopesByModel[scope.model.__cvrUniqueId()])
				delete this.scopesByModel[scope.model.__cvrUniqueId()][scope.path];
		}
	};
	
/*
 * Установка свойства привязанного к скоупу объекта
 */	
	this._setModelValue = function(scope, property, value){
		var m, propv, prop, m1, p, tmpv;
		var prop = this._resolveProperty(scope,property);
		m = prop[0].getModel(true);
		p = prop[1];
		if ((undefined !== m) && (m != null)){	
			prop = this._eval(m, p, true);
			if (prop !== undefined){
				m1 = prop.model;
				propv = prop.value;
				prop = prop.property;
				
				if ("function" == typeof propv)
					propv.apply(m1,[value]);
				else {
					if ((typeof propv == "number") && (typeof value == "string")){
						tmpv = parseFloat(value);
						if (!isNaN(tmpv)){ 
							if (isFinite(value)){
								tmpv = parseInt(value, 10);
							}
							value = tmpv;
						}
					}
					m1[prop] = value;
				}
				scope.invalidate();
			}
		}
	};
	
	this._resolveProperty = function(scope, property){
		if (property.substring(0,2) == "^.")
			return this._resolveProperty(scope.parent,property.slice(2));
			
		if (property.substring(0,2) == "$."){
			property = property.slice(2);
			root = this.rootScope;
		} else 
			root = scope;
		return [root, property];
	};
	
	this._parseArgs = function(scope, argsSrc){
		if (!argsSrc)
			return [];
		var arg = "", i = 0, result = [], start = 0, colonPos, openBracketPos, bp,
			open, closeBracketPos, tmp, openCount; 
		
		do {
			colonPos = argsSrc.indexOf(",", start);
			openBracketPos = argsSrc.indexOf("(", start);
			if ((openBracketPos > -1) && (openBracketPos < colonPos)){
				open = 1;
				bp = openBracketPos + 1;
				while (open > 0) {
					closeBracketPos = argsSrc.indexOf(")", bp);
					openBracketPos = argsSrc.indexOf("(", bp);
					
					
					if ((closeBracketPos > -1) || (openBracketPos > -1)){
						if ((closeBracketPos > -1) && ((closeBracketPos < openBracketPos) || (openBracketPos < 0))){
							open--;
							bp = closeBracketPos + 1;
						}
					
						if ((openBracketPos > -1) && (closeBracketPos > openBracketPos)){
							open++;
							bp = openBracketPos + 1;
						}
					} else {
						throw new Error("syntax error in expression '"+argsSrc+"': bracket not closed");
						break;
					}
				}
				
				result[i] = this._evaluate(scope, argsSrc.substring(start, closeBracketPos + 1).trim());
				colonPos = argsSrc.indexOf(",", closeBracketPos + 1);
			} else if (colonPos > -1) {
				result[i] = this._evaluate(scope, argsSrc.substring(start, colonPos).trim());
			} else
				result[i] = this._evaluate(scope, argsSrc.substring(start).trim());
			start = colonPos + 1;
			i++;
		} while (colonPos > -1);
		return result;
	};
	
	this._eval = function(m, prop, lax){
		if ((m === undefined) || (m === null))
			return undefined;
		var path = prop.split("."), result = m, model, p, i = 0;
		
		while ((i < path.length) && ((result[path[i]] !== undefined) || (lax && (i == path.length - 1)))){
			model = result;
			p = path[i];
			result = result[path[i]];
			if (("function" == typeof result) && (i < path.length - 1))
				result = result.call(model);
			
			if ((result === undefined || result === null) 
					&& !(lax && (i == path.length - 1))){
					break;
			}
			i++;
		}
		
		if (i < path.length)
			return undefined;
		
		return {model: model, value: result, property: p};
	};
	
	this._evaluate = function(scope, property, domelement, event, callback, sargs){
		var value, args, i, prop, tmp, m;
		
		if (property == "@path"){
			return scope.path;
		}
		
		if (property == "@index"){
			return parseInt(scope.path.substring(scope.path.lastIndexOf(".") + 1), 10);
		}
		
		if (property == "@scope")
			return scope.getModel(true);
		/*
		if (property == 'true')
			return true;
		
		if (property == 'false')
			return false;
		*/
		if ($.isNumeric(property))
			return property;
		
		if ((property.indexOf("'") == 0) || (property.indexOf("\"") == 0))
			return property.substring(1,property.length - 1);
		
		if(property == "true")
			return true;
		
		if(property == "false")
			return false;
		
		prop = this._resolveProperty(scope,property);
		m = prop[0].getModel(true);
		property = prop[1];
		
		if (property.indexOf("(") > -1){
			args = this._parseArgs(scope, property.substring(property.indexOf("(") + 1, property.lastIndexOf(")")).trim());
			property = property.substring(0,property.indexOf("("));
			
			if ((args.length > 0) && (undefined != caviar.predicates[property.trim()]))
				return caviar.predicates[property.trim()].apply(null,args);
		}		
				
		if ((undefined != m) && (m != null)){				
			value = this._eval(m,property);
			if (value != undefined){
				m = value.model;
				value = value.value;
			}
			
			while ("function" == typeof value){
				if (undefined == args)
					args = [];
				
				if (undefined != sargs){
					tmp = args.concat(sargs);
					args = tmp;
				}
				
				if (undefined != domelement)
					args[args.length] = domelement;
				
				if (undefined != event)
					args[args.length] = event;				
								
				if (undefined != callback)
					args[args.length] = callback;
				
				value = value.apply(m, args);
				args = [];
			}
			
			if (this.debugMode && (value === undefined))
				console.warn("caviar apply: undefined value got for expression (" + m.constructor.name + ")" + ((prop[0] == "m")?scope.path:"window") + "->" + property);			
		}	
		return value;
	};
	
	this.cloneBinding = function(root, eb, element){
		var i, b, bid, el = element;
		
		if (eb.relativeIndex){
			el = $(eb.relativeIndex, element);
		}
			
		b = new cvrBinding(root, el, eb.invalidator);
		
		if (undefined != eb.ifexpr){
			b.ifexpr = eb.ifexpr;
		}
		
		if (undefined != eb._tn){
			b._tn = eb._tn;
		}
		
		if (undefined != eb._gproperty){
			b._gproperty = eb._gproperty;
		}
		
		if (undefined != eb._sproperty){
			b._sproperty = eb._sproperty;
			if (b._tn === "select" || b._tn === "textarea" || b._tn == "input"){
				el.change(function(){
					caviar._setModelValue(root,b._sproperty,($(this).attr("type") == "checkbox")?this.checked:$(this).val());
				});
			}
		}
		
		if (undefined != eb._styles){
			b._styles = eb._styles;
			b._prevStyles = {};
		}
		
		if (undefined != eb._attrs){
			b._attrs = eb._attrs;
			b._prevAttrs = {};
		}
		
		if (undefined != eb._classes){
			b._classes = eb._classes;
			b._prevClasses = {};
		}
		
		if (undefined != eb._events){
			for (j = 0; j < eb._events.length; j++){
				el.unbind(eb._events[j].event,event_handler);
				el.bind(eb._events[j].event,{scope:root, handler:eb._events[j].handler},event_handler);
			}
		}
		
		if (undefined != eb.elementTemplate)
			b.elementTemplate = eb.elementTemplate;
		
		bid = this._nextBid();
		
		el.attr("cvr-bid",bid);		
		
		for (i = 0; i < eb.childBindings.length; i++){
			b.childBindings[i] = this.cloneBinding(root, eb.childBindings[i], element);
		}
		
		this.bindings[bid] = b;
		
		return b;
	};
	
	this.cloneScopeAndBindings = function(element, path, srcScope, parentScope, cycleContext){
		var root, i, result = $(element);

		root = caviar.scopesByPath[path];
		
		if (undefined == root){
			root = new cvrScope(path, parentScope, srcScope.reactOnParent, srcScope.reactOnChildren);
			this.scopesByPath[path] = root;
			parentScope.addChild(root);
		}
		
		for (i = 0; i < srcScope.bindings.length; i++) {
			if ((srcScope.bindings[i].relativeIndex != undefined) && (!cycleContext || !srcScope.bindings[i].cycleContext || srcScope.bindings[i].cycleContext == cycleContext)) {
				root.addBinding(this.cloneBinding(root, srcScope.bindings[i], result));
			}
		}
		
		if (!srcScope.colScope){
			for (i = 0; i < srcScope.children.length; i++) {
				this.cloneScopeAndBindings(element, path + srcScope.children[i].path.substring(srcScope.path.length), srcScope.children[i], root, cycleContext);
			}
		}
		
		return result;
	};
		
	this.bind = function(element, scopePath, parentScope, cloneMode, cycleContext){
		var root, binder, indexer, selector, result = $(element);
		
		if (scopePath == null)
			root = caviar.rootScope;
		else {
			root = caviar.scopesByPath[scopePath];
			if (undefined == root){
				root = new cvrScope(scopePath, parentScope, false, false);
				caviar.scopesByPath[scopePath] = root;
				if (parentScope)
					parentScope.addChild(root);				
			}
		}
			
		//this._clearScope(root);
		
		selector = "[cvr-scope],[cvr-bind],[cvr-data],[cvr-set],[cvr-get],[cvr-html],[cvr-style],[cvr-classes],[cvr-handlers],[cvr-foreach],[cvr-tpl],[cvr-attrs],[cvr-if],[cvr-observe]";
		
		indexer = function(root, el){
			var result = [], i = 0;
			
			while (el !== root){
				result[i] = ">:nth-child(" + ($(el).parent().children().index(el) + 1) + ")";
				el = $(el).parent()[0];
				i++;
			}
			return result.reverse().join("");
		};		
		
		binder = function(){
				var me, scope_path, abs_scope, 
					react_parent, react_child, ps, 
					pth, i, invalidator, tpl, s,
					bindexpr, ifexpr, doBind, tn, events, 
					e, h, m, bid, b, tplval, tpldomel, 
					tmp, colScope, colTpl, _tn, _sproperty, _gproperty, _gforcetxt, 
					_styles, _attrs, _classes, classes, observ, observMode, _events, h, fepath;
				
				me = $(this);
								
				scope_path = [];
				abs_scope = false;
				
				if (undefined != me.attr("cvr-watch-parent")){
					react_parent =  Boolean(me.attr("cvr-watch-parent"));
				}
				
				if (undefined != me.attr("cvr-watch-children")){
					react_child =  Boolean(me.attr("cvr-watch-children"));
				}
		
				if (undefined != me.attr("cvr-scope")){
					scope_path = me.attr("cvr-scope").split(".");
						
					if (scope_path[0] === "$"){
						scope_path.shift();
						abs_scope = true;
					}
				}
										
				if (!abs_scope && !me.is(element)){
					me.parentsUntil(element,"[cvr-scope]").each(function(){
						var sce, p;
						sce = $(this);
						p = sce.attr("cvr-scope").split(".");
						if (p[0] === "$"){
							abs_scope = true;
							p.shift();
						}
						scope_path = p.concat(scope_path);
						
						/*
						 * 
						 * Наследование признаков реакции на инвалидейты, вроде нахуй не нужно
						 * 
						if (undefined == react_parent){
							if (undefined != sce.attr("cvr-watch-parent"))
								react_parent = Boolean(sce.attr("cvr-watch-parent"));
							else
								react_parent = false;
						}
						
						if (undefined == react_child){
							if (undefined != sce.attr("cvr-watch-children"))
								react_child =  Boolean(sce.attr("cvr-watch-children"));
							else
								react_child = true;
						}
						*/
						return !abs_scope;
					});
				}
				
				ps = root;
				pth = root.path;
				if (scope_path.length > 0)
					pth = ((root.path == "")?"":(".")) + scope_path.join(".");
				
				if (undefined != caviar.scopesByPath[pth])
					ps = caviar.scopesByPath[pth];
				else {
					pth = root.path;
					for (i = 0; i < scope_path.length; i++){
						pth = ((pth == "")?"":(pth + ".")) + scope_path[i];
						if (undefined == caviar.scopesByPath[pth]){
							s = new cvrScope(pth,ps,(undefined != react_parent)?react_parent:true,(undefined != react_child)?react_child:false);
							ps.addChild(s);
							caviar.scopesByPath[pth] = s;
							ps = s;
							ps.getModel(true);
						} else
							ps = caviar.scopesByPath[pth];
					}
				}
				/*
				if (undefined != react_parent)
					ps.ReactOnParent = react_parent;

				if (undefined != react_child)
					ps.ReactOnChildren = react_child;
				*/				
				invalidator = "";
				
				if (undefined != me.attr("cvr-tpl")){
					tplval = me.attr("cvr-tpl");
					if (undefined == caviar.templates[tplval]){
						tpldomel = $("#"+tplval);
						if (tpldomel.length > 0){
							caviar.templates[tplval] = tpldomel.html().trim();
							tpldomel.remove();
						} else
							console.error("template not found");
						/*
						$.ajax({
							url:tplval+".html",
							dataType:"html",
							success:function(data){
								caviar.templates[tplval] = data.trim();
							},
							async: false
						});
						*/
					}
					
					if (undefined != caviar.templates[tplval]){
						tmp = $($.parseHTML(caviar.templates[tplval]));
						if (undefined !== me.attr("cvr-sp")){
							tmp.attr("cvr-sp", me.attr("cvr-sp"));
						}
						me.replaceWith(tmp);
						return caviar.bind(tmp, pth, ps, cloneMode);
					}					
				} else {
					bindexpr = "";
					
					if (undefined != me.attr("cvr-bind"))
						bindexpr = me.attr("cvr-bind");
										
					doBind = false;
					
					if (undefined != me.attr("cvr-if")) {
						ifexpr = me.attr("cvr-if");
						doBind = true;
					}

					if ((undefined != me.attr("cvr-data"))
							|| (undefined != me.attr("cvr-html"))
							|| (undefined != me.attr("cvr-get")) 
							|| (undefined != me.attr("cvr-set"))){
						_tn = me.get(0).tagName.toLowerCase();
						if ((undefined != me.attr("cvr-set")) || bindexpr.indexOf("read") == -1 || bindexpr.indexOf("data") > -1 || bindexpr.indexOf("write") > -1) {
							_sproperty = me.attr("cvr-set") || me.attr("cvr-data");
						}
						
						if ((
								undefined != me.attr("cvr-get")
								|| undefined != me.attr("cvr-html")
							) || bindexpr.indexOf("write") == -1 || bindexpr.indexOf("read") > -1 || bindexpr.indexOf("data") > -1) {
							_gproperty = me.attr("cvr-html") || me.attr("cvr-get") || me.attr("cvr-data");
							_gforcetxt = ('undefined' == typeof me.attr("cvr-html"));
						}
						
						if (_sproperty){					
							if (_tn === "select" || _tn === "textarea" || _tn == "input"){
								me.change(function(){
									caviar._setModelValue(ps,_sproperty,($(this).attr("type") == "checkbox")?this.checked:$(this).val());
								});
							}
						}
					
						if (_gproperty) {
							invalidator = invalidator + "this._applyValue(" + (_gforcetxt?'true':'') + ");";
						}
						doBind = true;
					}
										
					if (undefined != me.attr("cvr-style")){
						invalidator = invalidator + "this._applyStyles();";
						sa = me.attr("cvr-style");
						styles = sa.split(";");
						_styles = {};
						for (i = 0; i < styles.length; i++){
							style = styles[i].split(":");
							if (style.length > 1){
								_styles[style[0].trim()] = style[1].trim();
							}
						}		
						doBind = true;
					}
					
					if (undefined != me.attr("cvr-attrs")){
						invalidator = invalidator + "this._applyAttrs();";
						sa = me.attr("cvr-attrs");
						attrs = sa.split(";");
						_attrs = {};
						for (i = 0; i < attrs.length; i++){
							attr = attrs[i].split(":");
							if (attr.length > 1)
								_attrs[attr[0].trim()] = attr[1].trim();
						}		
						doBind = true;
					}					
	
					if (undefined != me.attr("cvr-classes")){
						invalidator = invalidator + "this._applyClasses();";
						ca = me.attr("cvr-classes");
						classes = ca.split(";");
						_classes = {};
						for (i = 0; i < classes.length; i++){
							c = classes[i].split(":");
							if (c.length > 1)
								_classes[c[0].trim()] = c[1].trim();
						}
						doBind = true;
					}
					
					
					if (undefined != me.attr("cvr-handlers")){
						events = me.attr("cvr-handlers").split(";");
						
						if (cloneMode){
							_events = [];
							doBind = true;
						}
						
						for (i = 0; i < events.length; i++){
							e = events[i].split(":");
							if (e.length > 1){
								if (_events != undefined)
									_events[i] = {event:e[0].trim(),handler:e[1].trim()};
								me.unbind(e[0].trim(), event_handler);
								me.bind(e[0].trim(),{scope:ps, handler:e[1].trim()}, event_handler);
							}
						}
					}
					
					if (doBind){
						
						b = new cvrBinding(ps, me, new Function("","if (!this._beforeInvalidate().isDefaultPrevented()){"+invalidator+"this._afterInvalidate();}"));

						/*
						if (undefined != me.attr("cvr-observe") || observ) {
							if (!observ)
								observ = [];
							if (undefined != me.attr("cvr-observe"))
								observ = observ + me.attr("cvr-observe").split(',');
							b.observe = {};
							for (i = 0; i < observ.length; i++){
								c = observ[i].split(":");
								observMode = 'self';
								if (c.length > 1)
									observMode = c[1].trim();
								b.observe[c[0].trim()] = observMode?observMode:'self';
							}
						}											
						*/
						if ('undefined' != typeof ifexpr)
							b.ifexpr = ifexpr;
						
						if ('undefined' != typeof _tn)
							b._tn = _tn;
						
						if ('undefined' != typeof _gproperty){
							b._gproperty = _gproperty;
						}

						if ('undefined' != typeof _sproperty){
							b._sproperty = _sproperty;
						}						
						
						if ('undefined' != typeof _styles){
							b._styles = _styles;
							b._prevStyles = {};
						}
						
						if ('undefined' != typeof _attrs){
							b._attrs = _attrs;
							b._prevAttrs = {};
						}
						
						if ('undefined' != typeof _classes){
							b._classes = _classes;
							b._prevClasses = {};
						}
						
						if ('undefined' != typeof _events)
							b._events = _events;
												
						ps.addBinding(b);
						
						bid = caviar._nextBid();
						me.attr("cvr-bid",bid);	
						caviar.bindings[bid] = b;
						if (cloneMode){
							b.relativeIndex = indexer(result[0],this);
							b.cycleContext = cycleContext;
						}
					}
					
					if (undefined != me.attr("cvr-foreach")){
						property = caviar._resolveProperty(ps, me.attr("cvr-foreach"));
						fepath = property[0].path+(property[0].path?".":"")+property[1];
						if (undefined != caviar.scopesByPath[fepath])
							colScope = caviar.scopesByPath[fepath];
						else {
							colScope = new cvrScope(fepath, ps, false, false);
							colScope.colScope = true;
							ps.addChild(colScope);
							caviar.scopesByPath[colScope.path] = colScope;
						}
						
						colTpl = "";
						tmp = $.parseHTML(me.html().trim());
						if (tmp && tmp.length > 0)
							colTpl = tmp[0];
						
						me.html("");
						
						cb = new cvrBinding(colScope, me, new Function("","this._applyForeach();"));
						cb.elementTemplate = colTpl;
						colScope.addBinding(cb);
						if (cloneMode)
							cb.relativeIndex = indexer(result[0],this);
						
						// TODO Допилить - сейчас если на форич накладываются другие биндинги, 
						// при вызове обновления по элементу не будет вызвана отрисовка содержимого
						if (undefined == b){
							bid = caviar._nextBid();
							me.attr("cvr-bid",bid);
							caviar.bindings[bid] = cb;
						}
					} 
				}		
				
				return this;
		};
		
		if (result.is(selector))
			result = $(binder.apply(result[0]));
		$(selector, result).not($("template, [cvr-foreach]", result).find(selector)).each(binder);
		return result;
	};
};

var caviar = new Caviar();
caviar.rootScope = new cvrScope("",null,false,false);
caviar.scopesByPath[""] = caviar.rootScope;
caviar.rootScope.getModel(true);

$(document).ready(function(){
	$("<style type='text/css'> .cvr-hidden-by-if { display:none !important; visibility: hidden !important; }</style>").appendTo("head");	
	
	caviar.bind(window.document,null);
	for (var i = 0; i < caviar.rootScope.children.length; i++)
		if ("function" == typeof caviar.launchers[caviar.rootScope.children[i].path])
			caviar.launchers[caviar.rootScope.children[i].path].call();
		else
			caviar.rootScope.children[i].invalidateBranch(true);
});