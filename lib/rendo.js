var oil = require('oil');

var binary = {
    "==": function (left, right) { return left == right; },
    "!=": function (left, right) { return left != right; },
    "<": function (left, right) { return left < right; },
    ">": function (left, right) { return left > right; },
    "<=": function (left, right) { return left <= right; },
    ">=": function (left, right) { return left >= right; },
    "<<": function (left, right) { return left >> right; },
    ">>": function (left, right) { return left << right; },
    "+": function (left, right) { return left != null ? (right != null ? left + right : left) : right; }, // preventing string operation with null to convert to "null"
    "-": function (left, right) { return left != null ? (right != null ? left - right : left) : -right; }, // preventing string operation with null to conert to NaN
    "*": function (left, right) { return left * right; },
    "/": function (left, right) { return left / right; },
    "%": function (left, right) { return left % right; }
};

var unary = {
    "!": function (argument) { return !argument; },
    "+": function (argument) { return +argument; },
    "-": function (argument) { return -argument; }
};

var expressions = {
    "?:": function (expression, model) {
        if (evaluate(expression.expression, model)) {
            return evaluate(expression.positive, model);
        }
        else {
            return evaluate(expression.negative, model);
        }
    },
    "?=": function (expression, model) {
        var value = evaluate(expression.expression, model);
        for (var i = 0; i < expression.options.length; i++) {
            var option = expression.options[i];
            if (evaluate(option.value, model) == value) {
                return evaluate(option.result, model);
            }
        }
        return evaluate(expression.otherwise, model);
    },
    "f": function (expression, model) {
        var object = evaluate(expression.object, model);
        if (object) {
            return object[expression.field];
        }
        return null;
    },
    "i": function (expression, model) {
        return model.get(expression.identifier);
    },
    "b": function (expression, model) {
        return binary[expression.operator](evaluate(expression.left, model), evaluate(expression.right, model));
    },
    "u": function (expression, model) {
        return unary[expression.operator](evaluate(expression.argument, model));
    },
    "??": function (expression, model) {
        var left = evaluate(expression.left, model);
        if (left == null) {
            return evaluate(expression.right, model);
        }
        return left;
    },
    "&&": function (expression, model) {
        return evaluate(expression.left, model) && evaluate(expression.right, model);
    },
    "||": function (expression, model) {
        return evaluate(expression.left, model) || evaluate(expression.right, model);
    },
    "@": function (expression, model) {
        var sequence = evaluate(expression.sequence, model);
        if (sequence) {
            return sequence[evaluate(expression.key, model)];
        }
        return null;
    },
    "@:": function (expression, model) {
        var sequence = evaluate(expression.sequence, model);
        if (sequence) {
            return sequence.slice(evaluate(expression.start, model), evaluate(expression.end, model));
        }
        return null;
    },
    "s": function (expression, model) {
        function sequencer(item) {
            return {
                get: function (k) {
                    return k == expression.key ? item : model.get(k);
                }
            };
        }

        var result = [];
        var sequence = evaluate(expression.sequence, model);
        if (sequence && sequence.constructor === Array) {
            if (expression.order) {
                var comparisons = sequence.map(function (x) { return { field: evaluate(expression.order, sequencer(x)), item: x }; });
                comparisons.sort(function (a, b) {
                    if (a.field != null) {
                        if (b.field != null) {
                            if (typeof a.field === "string") {
                                if (typeof b.field === "string") {
                                    return a.field.localeCompare(b.field);
                                }
                                return 1;
                            }
                            else if (typeof b.field === "string") {
                                return -1;
                            }
                            else if (a.field < b.field) {
                                return -1;
                            }
                            else if (b.field < a.field) {
                                return 1;
                            }
                            else {
                                return 0;
                            }
                        }
                        else {
                            return -1;
                        }
                    }
                    else if (b.field) {
                        return 1;
                    }
                    else {
                        return 0;
                    }
                });
                sequence = comparisons.map(function (x) { return x.item; });
            }
            for (var i = 0; i < sequence.length; i++) {
                var item = sequence[i];
                var s = sequencer(item);
                if (!expression.condition || evaluate(expression.condition, s)) {
                    result.push(expression.selection ? evaluate(expression.selection, s) : item);
                }
            }
        }
        return result;
    },
    "=": function (expression, model) {
        return null;
    }
};

var modifiers = {
    round: function (value) {
        return Math.round(value)
    },
    floor: function (value) {
        return Math.floor(value)
    },
    ciel: function (value) {
        return Math.ciel(value)
    },
    ciel: function (value) {
        return Math.ciel(value)
    },
    any: function (value) {
        if (value == null) {
            return false;
        }
        else if (value.constructor === Array) {
            return value.length > 0;
        }
        return true;
    },
    slice: function (value, size) {
		if (value && value.constructor === Array) {
			var slices = [];
			var sliceCount = Math.ceil(value.length / size);
			for (var s = 0; s < sliceCount; s++) {
				slices.push(value.slice(s * size, (s + 1) * size));
			}
			return slices;
		}
        return value;
    },
    properties: function (value) {
        var arr = [];
        if (value && typeof value === "object") {
            for (var key in value) {
                if (value.hasOwnProperty(key)) {
                    arr.push({key: key, value: value[key]});
                }
            }
        }
        return arr;
    },
    number: function (value) {
        var f = parseFloat(value);
        if (!isNaN(f)) {
            var s = f.toString();
            var p = s.indexOf('.');
            var i = p > 0 ? s.slice(0, p) : s;
            var n = i.length - 3;
            while (n > 0) {
                i = i.slice(0, n) + ',' + i.slice(n);
                n -= 3;
            }
            return p > 0 ? i + s.slice(p) : i;
        }
        return "";
    },
    date: function (value, format) {
        if (value != null) {
            var d = new Date(value);
            if (format === "f") {
                return d.getDate() + "/" +
                    (d.getMonth() + 1) + "/" +
                    d.getFullYear() + " " +
                    ("0" + d.getHours()).slice(-2) + ":" +
                    ("0" + d.getMinutes()).slice(-2);
            }
			if (format === "t") {
                return ("0" + d.getHours()).slice(-2) + ":" +
                    ("0" + d.getMinutes()).slice(-2);
            }

            return d.getDate() + "/" +
                (d.getMonth() + 1) + "/" +
                d.getFullYear();
        }
        return "";
    },
    sqrt: function (value) {
        return Math.sqrt(value);
    },
    pow: function (value) {
        return Math.pow(value);
    },
    sin: function (value) {
        return Math.sin(value);
    },
    cos: function (value) {
        return Math.cos(value);
    },
    tan: function (value) {
        return Math.tan(value);
    },
    asin: function (value) {
        return Math.asic(value);
    },
    acos: function (value) {
        return Math.acos(value);
    },
    atan: function (value) {
        return Math.atan(value);
    },
    PI: function () {
        return Math.PI;
    }
};

function extend(source, obj) {
    if (source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                obj[key] = source[key];
            }
        }
    }
    return obj;
}

function evaluate(expression, model) {
    while (expression && expression["!exp"]) {
        if (expression.$x) {
            // Expression loop
            expression = null;
        }
        else {
            expression.$x = true;
            var r = expressions[expression["!exp"]](expression, model);
            expression.$x = false;
            expression = r;
        }
    }
    if (expression && expression["!type"]) {
        var modifier = modifiers[expression["!type"]];
        if (modifier) {
            var init = expression["!init"];
            var args = [];
            if (init && init.length > 0) {
                args = init.map(function (x) { return evaluate(x, model); });
            }
            return modifier.apply(null, args);
        }
        return null;
    }
    return expression;
}

function isNotWhitespace(ch) {
    return !(ch === ' ' || ch === '\r' || ch === '\t' ||
    ch === '\n' || ch === '\v' || ch === '\u00A0');
}

function isNotIdentifier(ch) {
    return !('a' <= ch && ch <= 'z' ||
    'A' <= ch && ch <= 'Z' ||
    '_' === ch || ch === '$' || ch === '#');
}

function search(str, s, cb) {
    var i = 0;
    if (typeof s === "function") {
        cb = s;
    }
    else {
        i = s;
    }
    while (i < str.length && !cb(str[i])) {
        i++;
    }
    return i;
}

function Model(baseModel, model, parameters, env) {
    this.baseModel = baseModel;
    this.model = model;
    this.parameters = parameters;
    this.env = env;
}

Model.prototype.get = function (key) {
    if (key) {
        if (key[0] == '$') {
            var name = key.slice(1);
            var n = key.length === 1 ? 0 : parseInt(name);
            if (isNaN(n)) {
                if (this.env && this.env[name] != undefined) {
                    return this.env[name];
                }
                else if (this.baseModel) {
                    return this.baseModel.get(key);
                }
            }
            else if (this.parameters && n < this.parameters.length) {
                return evaluate(this.parameters[n].parameter, this.parameters[n].model);
            }
        }
        else {
            var v = null;
            if (typeof this.model === "object") {
                v = this.model[key];
            }
            if (v == null && this.baseModel != null) {
                return this.baseModel.get(key);
            }
            return v;
        }
    }

    return null;
};

function Rendo(template) {
    this.components = {};

    var components = oil.parse(template);

    for (var i = 0; i < components.length; i++) {
        var component = components[i];

        var name = component["!type"];
        if (name) {
            var render = component.render
                ? component.render
                : (component["!init"] && component["!init"].length > 0
                ? component["!init"][0]
                : (component["!ref"] || null));

            var scope = {};

            for (var key in component) {
                if (key[0] !== '!' && key !== "render") {
                    scope[key] = component[key];
                }
            }

            this.components[name] = {
                render: render,
                scope: scope
            };
        }
    }
}

Rendo.prototype.renderValue = function (value) {
    if (value != null && typeof value !== "object") {
        return "" + value;
    }
    return "";
};

Rendo.prototype.renderContents = function (contents, model) {
    var result = "";

    var s = 0;
    var o = contents.indexOf("{{");
    while (o >= s) {
        result += contents.slice(s, o);
        o += 2;

        var component = null;
        var fromModel = false;
        var i = search(contents, o, isNotWhitespace);

        if (contents[i] === ':' || contents[i] === '+') {
            fromModel = contents[i] == '+';
            o = i + 1;
            i = search(contents, o, isNotIdentifier);
            component = contents.slice(o, i);
        }

        // Reading to closing '}'
        var c = i;
        var count = 0;
        while (c < contents.length) {
            if (contents[c] === '{') {
                count++;
            }
            else if (contents[c] === '}') {
                if (count === 0) {
                    break;
                }
                count--;
            }
            c++;
        }


        var expressions = oil.parse(contents.slice(i, c));
        if (expressions.length > 0) {
            var models = evaluate(expressions[0], model);
            var parameters = expressions.slice(1).map(function (x) { return { model: model, parameter: x }; });

            var isArray = false;
            if (!models || models.constructor !== Array) {
                models = [models];
            }
            else {
                isArray = true;
            }

            for (var m = 0; m < models.length; m++) {
                var env = isArray ? {
                    index: m,
                    first: m === 0,
                    last: m === models.length - 1,
					previous: m > 0 ? models[m - 1] : null,
					next: m < models.length - 1 ? models[m + 1] : null
                } : null;
                if (component) {
                    if (fromModel) {
                        var renderContents = model.get(component);
                        if (renderContents) {
                            result += this.renderContents(renderContents, new Model(model, models[m], [{model: model, parameter: models[m]}].concat(parameters), env));
                        }
                    }
                    else {
                        result += this.render(component, new Model(model, models[m], null, env), [{model: model, parameter: models[m]}].concat(parameters));
                    }
                }
                else {
                    result += this.renderValue(models[m]);
                }
            }
        }
        else if (component) {
            // Render same model
            if (fromModel) {
                var renderContents = model.get(component);
                if (renderContents) {
                    result += this.renderContents(renderContents, model);
                }
            }
            else {
                result += this.render(component, model);
            }
        }

        if (c === contents.length || contents[c + 1] != "}") {
            return result;
        }

        s = c + 2;
        o = contents.indexOf("{{", s);
    }

    if (s < contents.length) {
        result += contents.slice(s);
    }

    return result;
};

Rendo.prototype.render = function (componentName, model, parameters) {
    if (componentName == null) {
        return this.renderValue(model);
    }

    var component = this.components[componentName];
    if (!component) {
        return "";
    }

    var contents = component.render;
    if (!contents) {
        return "";
    }

    var isArray = false;
    var models;
    if (model) {
        if (model.constructor === Array) {
            models = model;
            isArray = true;
        }
        else {
            models = [model];
        }
    }
    else {
        models = [null];
    }

    var result = "";
    for (var m = 0; m < models.length; m++) {
        var model = models[m];
        var env = isArray ? {
            index: m,
            first: m === 0,
            last: m === models.length - 1
        } : null;
        if (!model || model.constructor !== Model) {
            model = new Model(null, model, null, env);
        }

        result += this.renderContents(contents, new Model(model, component.scope, parameters, env));
    }
    return result;
};

Rendo.render = function (template, component, model) {
    return new Rendo(template).render(component, model);
};

module.exports = Rendo;