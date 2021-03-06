/************************************************/
/*                 Object utils                 */
/************************************************/


// Handy way to make an array from object.
Object.prototype.toArray = function () {
    return Array.from(this)
}

// Get all needed object own properties.
Object.prototype.getOwnProperties = function (excluding = []) {
    return Object.fromEntries(Object.getOwnPropertyNames(this)
        .filter(property => !excluding.includes(property))
        .map(property => [property, this[property]]))
}

// Add properties to object.
Object.prototype.addProperties = function (properties, rewrite = false) {
    if (Array.isArray(properties))
        properties = Object.assign(...properties)

    for (const [key, value] of Object.entries(properties)) {
        if (!this.hasOwnProperty(key) || rewrite)
            this[key] = value
    }
}

// Get object class if it's an instance.
Object.prototype.getClass = function () {
    return this.hasOwnProperty('prototype') ?
        this : // is a class
        this.constructor // is an instance
}

// Get object parent class.
Object.prototype.getParent = function () {
    return Object.getPrototypeOf(this.getClass())
}

// Universal way to get all class or object class static methods.
Object.prototype.getStaticMethods = function () {
    const objectClass = this.getClass()
    return objectClass.getOwnProperties(['length', 'prototype', 'name'])
}

// Universal way to get all class or object class non-static methods.
Object.prototype.getNonStaticMethods = function () {
    const objectClass = this.getClass()
    return objectClass.prototype.getOwnProperties(['constructor'])
}

// Universal way to get all class or object class attributes.
Object.prototype.getAttributes = function () {
    const objectClass = this.getClass()
    return (new objectClass()).getOwnProperties()
}

// Add static methods to class or object class.
Object.prototype.addStaticMethods = function (methods, rewrite = false) {
    const objectClass = this.getClass()
    objectClass.prototype.addProperties(methods, rewrite)
}

// Add non-static methods to class or object class.
Object.prototype.addNonStaticMethods = function (methods, rewrite = false) {
    this.prototype.addProperties(methods, rewrite)
}

// Add attributes to class or object class.
Object.prototype.addAttributes = function (attributes, rewrite = false) {
    const objectClass = this.getClass()
    objectClass.prototype.addProperties(attributes, rewrite)
}

// Map for Object
Object.prototype.map = function (callback) {
    return Object.fromEntries(Object.entries(this).map(v => [v[0], callback(v[1], v[0])]))
}

/*
 * Class.inject(TargetClass = Class.super :: Class|Object, rewrite = false :: Boolean) :: Class -> void
 *
 * Add all methods and attributes of one class into another; into parent by default.
 * 
 * Usage:
 *
 *   class SuperDuperPatch extends UnfortunateClass {
 *       additionalMethod() { ... }
 *       alreadyExistMethod() { ... }
 *   }
 *
 *   SuperDuperPatch.inject(, true) // Patches and rewrites whole class
 *   SuperDuperPatch.inject(unfortunateInstance, true) // Patches only object
 */
Object.prototype.inject = function (target = this.getParent(), rewrite = false) {
    target.addStaticMethods(this.getStaticMethods(), rewrite)
    target.addNonStaticMethods(this.getNonStaticMethods(), rewrite)
    target.addAttributes(this.getAttributes(), rewrite)
}

// Watch and log all object properties access.
function Watch(proxified, fullpath) {
    if (!(proxified && typeof proxified === "object" || typeof proxified === "function"))
        return proxified;
    if (typeof proxified.__watched !== 'undefined')
        return proxified;
    proxified.__watched = true;

    let handler = {
        get: function(target, name) {
            if (typeof target[name] !== "function")
                console.log(`Reading ${fullpath}.${name} -> ${JSON.stringify(target[name])}`);
            return target[name];
        },
        set: function(target, name, value) {
            console.log(`Writing ${fullpath}.${name} <- ${JSON.stringify(value)}`);
            target[name] = Watch(value, fullpath + "." + name);
            return true;
        },
        apply: function(target, that, args) {
            let result = target.apply(that, args);
            console.log(`Calling ${fullpath}(${args.join(', ')}) -> ${JSON.stringify(result)}`);
            return Watch(result, `${fullpath}(${args.join(', ')})`);
        },
    };

    const excludedProperties = [
        'length',    'prototype',
        'name',      'arguments',
        'caller',    '__watched'
    ]
    
    for (let [propertyName, property] of Object.entries(proxified.getOwnProperties(excludedProperties))) {
        proxified[propertyName] = Watch(property, fullpath + "." + propertyName);
    }

    return new Proxy(proxified, handler);
}


/************************************************/
/*                 Array utils                  */
/************************************************/


// Array.last property.
Object.defineProperty(Array.prototype, 'last', {
    get() { return this[this.length - 1] },
    set(value) { return this[this.length - 1] = value }
})

const TypedArray = Uint8Array.getParent()

// Check if TypedArray starts with provided bytes.
TypedArray.prototype.startsWith = function (starts) {
    if (starts.prototype !== this.prototype)
        starts = new this.constructor(starts.buffer)
    if (starts.length > this.length)
        return false

    return starts.every((v, k) => v === this[k])
}

// Concatenate TypedArrays.
TypedArray.prototype.concat = function (...arrays) {
    arrays = arrays.map(a => a.prototype !== this.prototype ?
        new Uint8Array(a.buffer) : a)
    arrays.unshift(this)

    const totalLength = arrays.reduce((l, a) => l + a.length, 0)
    const newArray = new this.constructor(totalLength)

    let offset = 0
    for (const array of arrays) {
        newArray.set(array, offset)
        offset += array.length
    }
    return newArray
}

// Concatenate buffers.
ArrayBuffer.prototype.concat = function (...buffers) {
    const arrays = buffers.map(a => new Uint8Array(a))
    return (new Uint8Array(this)).concat(...arrays).buffer
}


/************************************************/
/*                 String utils                 */
/************************************************/


// Split string keeping end after limit in the last element if keep = true.
String.prototype._split = String.prototype.split
String.prototype.split = function (splitter, limit, keep = false) {
    return keep ? [...this._split(splitter, limit - 1), this._split(splitter).slice(limit - 1).join(splitter)] : this._split(...arguments)
}

// Get escaped char.
String.prototype.escapeCharAt = function (index = 0) {
    const hex = this.charCodeAt(index).toString(16)

    if (hex.length <= 2) return `\\x${hex.padStart(2, '0')}`
    if (hex.length <= 4) return `\\u${hex.padStart(4, '0')}`
    return `\\u{${hex}}`
}

// Internal method for creating char filter.
String.prototype._getFilter = function (needle, except = true) {
    const _filter =
        // Needle is a filter function
        needle instanceof Function ? needle :
        // Needle is a regexp filter
        needle instanceof RegExp ? char => needle.test(char) :
        // Needle is a list of chars
        char => !!~String(needle).indexOf(char)

    // Return false if except mode is on and char matches needle or if except mode is off and char doesn't match needle.
    // True otherwise.
    return char => !(!except ^ _filter(char))
}

/*
 * String.escape(needle = '' :: String|RegExp|Function, except = true :: Boolean) -> String
 *
 * Escape string except chars that match needle or escape only ones that match if except mode is off.
 * Needle can be a string representing set of chars or RegExp or function.
 */
String.prototype.escape = function (needle = '', except = true) {
    const filter = this._getFilter(...arguments)

    return this.replace(/./g, char => filter(char) ? char.escapeCharAt(0) : char)
}

/*
 * String.unescape(needle = '' :: String|RegExp|Function, except = true :: Boolean) -> String
 *
 * Unescape string except chars that match needle or unescape only ones that match if except mode is off.
 * Needle can be a string representing set of chars or RegExp or function.
 */
String.prototype.unescape = function (needle = '', except = true) {
    const filter = this._getFilter(...arguments)

    return this.replace(
        /\\x([\da-f]{2})|\\u([\da-f]{4})/gi,
        (x, charHex2, charHex4) => {
            const charHex = charHex2 || charHex4
            const char = String.fromCharCode(parseInt(charHex, 16))

            return filter(char) ? char : x
        }
    )
}

// Replace all matches in a string.
if (!String.prototype.hasOwnProperty('replaceAll')) {
    String.prototype.replaceAll = function (needle, replacer) {
        return this.replace(RegExp(needle.escape(), 'gm'), replacer)
    }
}

/*
 * String.replaceAllByList(needlesList :: Array|String, replacer :: Array|String|Function, ?splitReplacer = true :: Boolean) -> String
 *
 * If needlesList is string, it splits to chars. If replacer is string of more than 1 chars and splitReplacer is true,
 * it splits too. Then all needles are replaced with corresponding replacer from the list or with one replacer for
 * all.
 */
String.prototype.replaceAllByList = function (needlesList, replacer, splitReplacer = true) {
    if (!Array.isArray(needlesList))
        needlesList = String(needlesList).split('')

    if (!Array.isArray(replacer) && !(replacer instanceof Function) && replacer.length > 1 && splitReplacer)
        replacer = String(replacer).split('')

    return needlesList.reduce((string, needle, index) =>
        string.replaceAll(needle, Array.isArray(replacer) ? replacer[index] : replacer), this)
}


/************************************************/
/*                 Number utils                 */
/************************************************/


/*
 * Number.till(end :: Number, step :: Number) -> generator
 *
 * Creates range generator from start to end including end with provided step.
 *
 * Array.from(4..till(7)) -> [4, 5, 6, 7]
 * Array.from(7..till(7)) -> [7]
 * for (i of start.till(end, step)) same as for (let i = start; i <= end; i += step)
 */
Number.prototype.till = function* (end, step = 1) {
    if (this > end) return
    for (let i = +this; i <= end; i += step) yield i
}

/*
 * Number.before(end :: Number, step :: Number) -> generator
 *
 * Creates range generator from start to end not including end with provided step.
 *
 * Array.from(4..before(7)) -> [4, 5, 6]
 * Array.from(7..before(7)) -> []
 * for (i of start.before(end, step)) same as for (let i = start; i < end; i += step)
 */
Number.prototype.before = function* (end, step = 1) {
    if (this >= end) return
    for (let i = +this; i < end; i += step) yield i
}

// Get number length.
// Same as N.toString(base).length
Number.prototype.length = function (base = 10) {
    return Math.ceil(Math.log(this) / Math.log(base))
}


/************************************************/
/*                 Promise utils                */
/************************************************/


// Check promise state (Node.js internal undocumented API)
Promise.prototype.getState = function () {
    return ['pending', 'resolved', 'rejected'][process.binding('util').getPromiseDetails(this)[0]]
}

// Check promise state (Node.js internal undocumented API)
Promise.prototype.isPending = function () {
    return process.binding('util').getPromiseDetails(this)[0] === 0
}

// Check promise state (Node.js internal undocumented API)
Promise.prototype.isResolved = function () {
    return process.binding('util').getPromiseDetails(this)[0] === 1
}

// Check promise state (Node.js internal undocumented API)
Promise.prototype.isRejected = function () {
    return process.binding('util').getPromiseDetails(this)[0] === 2
}

// Check promise state (Node.js internal undocumented API)
Promise.prototype.isFulfilled = function () {
    return process.binding('util').getPromiseDetails(this)[0] !== 0
}
