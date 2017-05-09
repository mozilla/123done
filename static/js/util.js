/**
 * Create a query parameter string from a key and value
 *
 * @method createQueryParam
 * @param {String} key
 * @param {Variant} value
 * @returns {String}
 * URL safe serialized query parameter
 */
function createQueryParam(key, value) {
  return encodeURIComponent(key) + '=' + encodeURIComponent(value);
}

/**
 * Create a query string out of an object.
 * @method objectToQueryString
 * @param {Object} obj
 * Object to create query string from
 * @returns {String}
 * URL safe query string
 */
function objectToQueryString(obj) {
  var queryParams = [];

  for (var key in obj) {
    queryParams.push(createQueryParam(key, obj[key]));
  }

  return '?' + queryParams.join('&');
}


function createKeyPair () {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256, // can be  128, 192, or 256
    },
    false, // whether the key is extractable (i.e. can be used in exportKey)
    ["encrypt", "decrypt"] // can "encrypt", "decrypt", "wrapKey", or "unwrapKey"
  )
    .then(function(key){
      //returns a key object
      console.log(key);
      return key;
    })
    .catch(function(err){
      console.error(err);
    });
}
