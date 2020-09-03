/**
使用说明
首先将 okhttpfind.dex 拷贝到 /mnt/sdcard/ 目录下，然后给目标App授予存储权限；
例：frida -U -l okhttp_poker.js -f com.example.demo --no-pause
接下来使用okhttp的所有请求将被拦截并打印出来；
扩展函数：
	find()                                         寻找okhttp3关键类及函数	
	switchLoader(\"okhttp3.OkHttpClient\")         参数：静态分析到的okhttpclient类名
	hold()                                         开启HOOK拦截
	history()                                      打印可重新发送的请求				
	resend(index)                                  重新发送请求		
		
	

备注 ： okhtpfind.dex 内包含了 更改了包名的okio以及Gson，以及Java写的寻找okhttp特征的代码。

原理：由于所有使用的okhttp框架的App发出的请求都是通过RealCall.java发出的，那么我们可以hook此类拿到request和response,
也可以缓存下来每一个请求的call对象，进行再次请求，所以选择了此处进行hook。
	

						
*/
var Cls_Call = "okhttp3.Call";
var Cls_CallBack = "okhttp3.Callback";
var Cls_Interceptor = "okhttp3.Interceptor";
var Cls_OkHttpClient = "okhttp3.OkHttpClient";
var Cls_OkHttpClient$Builder = "okhttp3.OkHttpClient$Builder";
var Cls_Request = "okhttp3.Request";
var Cls_Response = "okhttp3.Response";
var Cls_ResponseBody = "okhttp3.ResponseBody";
var Cls_okio_Buffer = "okio.Buffer";
var F_Builder_interceptors = "interceptors";
var F_Client_interceptors = "interceptors";
var M_Builder_build = "build";
var M_CallBack_onResponse = "onResponse";
var M_Call_clone = "clone";
var M_Call_enqueue = "enqueue";
var M_Call_execute = "execute";
var M_Call_request = "request";
var M_Client_newCall = "newCall";
var M_Interceptor_intercept = "intercept";
var M_buffer_readByteArray = "readByteArray";
var M_chain_connection = "connection";
var M_chain_proceed = "proceed";
var M_chain_request = "request";
var M_connection_protocol = "protocol";
var M_contentType_charset = "charset";
var M_header_get = "get";
var M_header_name = "name";
var M_header_size = "size";
var M_header_value = "value";
var M_req_body = "body";
var M_req_headers = "headers";
var M_req_method = "method";
var M_req_newBuilder = "newBuilder";
var M_req_url = "url";
var M_reqbody_contentLength = "contentLength";
var M_reqbody_contentType = "contentType";
var M_reqbody_writeTo = "writeTo";
var M_rsp$builder_body = "body";
var M_rsp$builder_build = "build";
var M_rspBody_contentLength = "contentLength";
var M_rspBody_contentType = "contentType";
var M_rspBody_create = "create";
var M_rspBody_source = "source";
var M_rspBody_string = "string";
var M_rsp_body = "body";
var M_rsp_code = "code";
var M_rsp_headers = "headers";
var M_rsp_message = "message";
var M_rsp_newBuilder = "newBuilder";
var M_rsp_request = "request";
var M_source_request = "request";

//----------------------------------
/**
 *  okhttp & okio 包名
 *  如果包名被混淆，请替换此处的包名，以增加find速度与准确性
 */
var okhttpPackageName = "okhttp3"
var okioPackageName = "okio"

/**
 *  过滤掉图片的响应打印
 *
 */
var filterArray = ["jpg", "png", "webp", "jpeg", "gif"]

//----------------------------------

var CallCache = []

var hookedArray = []


function buildNewResponse(responseObject) {
    var newResponse = null;
    Java.perform(function () {
        try {

            console.log("");
            console.log("┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────");

            newResponse = printAll(responseObject)

            console.log("└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────");
            console.log("");
        } catch (error) {
            console.log("printAll ERROR : " + error);
        }
    })
    return newResponse;
}


function printAll(responseObject) {
    try {
        var request = responseObject[M_rsp_request]()
        printerRequest(request)
    } catch (error) {
        console.log("print request error : ", error)
        return responseObject;
    }
    var newResponse = printerResponse(responseObject)
    return newResponse;
}


function printerRequest(request) {
    var javaString = Java.use("java.lang.String")
    var BufferClsss = Java.use(Cls_okio_Buffer)
    var Charset = Java.use("java.nio.charset.Charset")
    var defChatset = Charset.forName("UTF-8")

    var httpUrl = request[M_req_url]()

    console.log("| URL: " + httpUrl)
    console.log("|")
    console.log("| Method: " + request[M_req_method]())
    console.log("|")

    var requestBody = request[M_req_body]();
    var hasRequestBody = true
    if (null == requestBody) {
        hasRequestBody = false
    }
    var requestHeaders = request[M_req_headers]()
    var headersSize = requestHeaders[M_header_size]()

    console.log("| Headers:")
    if (hasRequestBody) {
        var contentType = requestBody[M_reqbody_contentType]()
        if (null != contentType) {
            console.log("|   ┌─" + "Content-Type: " + contentType)
        }
        var contentLength = requestBody[M_reqbody_contentLength]()
        if (contentLength != -1) {
            var tag = headersSize == 0 ? "└─" : "┌─"
            console.log("|   " + tag + "Content-Length: " + contentLength)
        }
    }
    for (var i = 0; i < headersSize; i++) {
        var name = requestHeaders[M_header_name](i)
        if (!javaString.$new("Content-Type").equalsIgnoreCase(name) && !javaString.$new("Content-Length").equalsIgnoreCase(name)) {
            var value = requestHeaders[M_header_value](i)
            var tag = i == (headersSize - 1) ? "└─" : "┌─"
            console.log("|   " + tag + name + ": " + value)
        }
    }
    console.log("|");
    if (!hasRequestBody) {
        console.log("|" + "--> END ");
    } else if (bodyEncoded(requestHeaders)) {
        console.log("|" + "--> END  (encoded body omitted > bodyEncoded)");
    } else {
        console.log("| Body:")
        var buffer = BufferClsss.$new()
        requestBody[M_reqbody_writeTo](buffer)
        var reqByteString = getByteString(buffer)

        var charset = defChatset
        var contentType = requestBody[M_reqbody_contentType]()
        if (null != contentType) {
            var appcharset = contentType[M_contentType_charset](defChatset);
            if (null != appcharset) {
                charset = appcharset;
                // console.log("--------------->"+charset)
            }
        }
        if (isPlaintext(reqByteString)) {
            console.log(splitLine(readBufferString(reqByteString, charset), "|   "))
            console.log("|");
            console.log("|" + "--> END ")
        } else {
            console.log(splitLine("Base64[" + reqByteString.base64() + "]", "|   "))
            console.log("|");
            console.log("|" + "--> END  (binary body omitted -> isPlaintext)")
        }
    }
    console.log("|");
}


function printerResponse(response) {
    var newResponse = null;
    try {
        var Charset = Java.use("java.nio.charset.Charset")
        var defChatset = Charset.forName("UTF-8")

        var url = response[M_rsp_request]()[M_req_url]()

        var shielded = filterUrl(url.toString())
        if (shielded) {
            return response;
        }

        console.log("| URL: " + url)
        console.log("|")
        console.log("| Status Code: " + response[M_rsp_code]() + " / " + response[M_rsp_message]())
        console.log("|")
        var responseBody = response[M_rsp_body]()
        var contentLength = responseBody[M_rspBody_contentLength]()
        var resp_headers = response[M_rsp_headers]()
        var respHeaderSize = resp_headers[M_header_size]()
        console.log("| Headers:")
        for (var i = 0; i < respHeaderSize; i++) {
            var tag = i == (respHeaderSize - 1) ? "└─" : "┌─"
            console.log("|   " + tag + resp_headers[M_header_name](i) + ": " + resp_headers[M_header_value](i))
        }

        var content = "";
        var nobody = !hasBody(response)
        if (nobody) {
            console.log("| No Body : ", response)
            console.log("|" + "<-- END HTTP")
        } else if (bodyEncoded(resp_headers)) {
            console.log("|" + "<-- END HTTP (encoded body omitted)")
        } else {
            console.log("| ");
            console.log("| Body:")
            var source = responseBody[M_rspBody_source]()
            var rspByteString = getByteString(source)
            var charset = defChatset
            var contentType = responseBody[M_rspBody_contentType]()
            if (null != contentType) {
                var appcharset = contentType[M_contentType_charset](defChatset)
                if (null != appcharset) {
                    charset = appcharset
                }
            }
            var mediaType = responseBody[M_rspBody_contentType]()
            var class_responseBody = Java.use(Cls_ResponseBody)
            var newBody = class_responseBody[M_rspBody_create](mediaType, rspByteString.toByteArray())
            var newBuilder = response[M_rsp_newBuilder]()
            newResponse = newBuilder[M_rsp$builder_body](newBody)[M_rsp$builder_build]()


            if (!isPlaintext(rspByteString)) {
                console.log("|" + "<-- END HTTP (binary body omitted)");
            }
            if (contentLength != 0) {
                try {
                    var content = readBufferString(rspByteString, charset)
                    console.log(splitLine(content, "|   "))
                } catch (error) {
                    console.log(splitLine("Base64[" + rspByteString.base64() + "]", "|   "))
                }

                console.log("| ");
            }
            console.log("|" + "<-- END HTTP");
        }
    } catch (error) {
        console.log("print response error : ", error)
        if (null == newResponse) {
            return response;
        }
    }
    return newResponse;
}


function bodyEncoded(headers) {
    if (null == headers) return false;
    var javaString = Java.use("java.lang.String")
    var contentEncoding = headers[M_header_get]("Content-Encoding")
    return contentEncoding != null && !javaString.$new("identity").equalsIgnoreCase(contentEncoding)

}


function hasBody(response) {
    var javaString = Java.use("java.lang.String")
    var m = response[M_rsp_request]()[M_req_method]();
    if (javaString.$new("HEAD").equals(m)) {
        return false;
    }
    var Transfer_Encoding = "";
    var resp_headers = response[M_rsp_headers]()
    var respHeaderSize = resp_headers[M_header_size]()
    for (var i = 0; i < respHeaderSize; i++) {
        if (javaString.$new("Transfer-Encoding").equals(resp_headers[M_header_name](i))) {
            Transfer_Encoding = resp_headers[M_header_value](i);
            break
        }
    }
    var code = response[M_rsp_code]()
    if (((code >= 100 && code < 200) || code == 204 || code == 304)
        && response[M_rspBody_contentLength] == -1
        && !javaString.$new("chunked").equalsIgnoreCase(Transfer_Encoding)
    ) {
        return false;
    }
    return true;
}



function isPlaintext(byteString) {
    try {
        var bufferSize = byteString.size()
        var buffer = NewBuffer(byteString)

        for (var i = 0; i < 16; i++) {
            if (bufferSize == 0) {
                console.log("bufferSize == 0")
                break
            }
            var codePoint = buffer.readUtf8CodePoint()
            var Character = Java.use("java.lang.Character")
            if (Character.isISOControl(codePoint) && !Character.isWhitespace(codePoint)) {
                return false;
            }
        }
        return true;
    } catch (error) {
        // console.log(error)
        // console.log(Java.use("android.util.Log").getStackTraceString(error))
        return false;
    }

}


function getByteString(buffer) {
    var bytearray = buffer[M_buffer_readByteArray]();
    var byteString = Java.use("com.singleman.okio.ByteString").of(bytearray)
    return byteString;
}

function NewBuffer(byteString) {
    var bufferCls = Java.use("com.singleman.okio.Buffer");
    var buffer = bufferCls.$new()
    byteString.write(buffer)
    return buffer;
}


function readBufferString(byteString, chatset) {
    var byteArray = byteString.toByteArray();
    var str = Java.use("java.lang.String").$new(byteArray, chatset)
    return str;
}

function splitLine(string, tag) {
    var newSB = Java.use("java.lang.StringBuilder").$new()
    var newString = Java.use("java.lang.String").$new(string)
    var lineNum = Math.ceil(newString.length() / 150)
    for (var i = 0; i < lineNum; i++) {
        var start = i * 150;
        var end = (i + 1) * 150
        newSB.append(tag)
        if (end > newString.length()) {
            newSB.append(newString.substring(start, newString.length()))
        } else {
            newSB.append(newString.substring(start, end))
        }
        newSB.append("\n")
    }
    return newSB.deleteCharAt(newSB.length() - 1).toString()
}

/**
 * 
 */
function alreadyHook(str) {
    for (var i = 0; i < hookedArray.length; i++) {
        if (str == hookedArray[i]) {
            return true;
        }
    }
    return false;
}

/**
 * 
 */
function filterUrl(url) {
    for (var i = 0; i < filterArray.length; i++) {
        if (url.indexOf(filterArray[i]) != -1) {
            console.log(url + " ?? " + filterArray[i])
            return true;
        }
    }
    return false;
}

function hookRealCall(realCallClassName) {
    Java.perform(function () {

        console.log(" ...........  hookRealCall  : " + realCallClassName)

        var RealCall = Java.use(realCallClassName)
        if ("" != Cls_CallBack) {
            //异步
            RealCall[M_Call_enqueue].overload(Cls_CallBack).implementation = function (callback) {

                var realCallBackClassName = callback.$className
                Java.use(realCallBackClassName)[M_CallBack_onResponse].overload(Cls_Call, Cls_Response).implementation = function (call, response) {

                    console.log("-------------------------------------HOOK SUCCESS 异步--------------------------------------------------")
                    var newResponse = buildNewResponse(response)

                    this[M_CallBack_onResponse](call, newResponse)

                }

                this[M_Call_enqueue](callback)
            }
        }

        //同步  
        RealCall[M_Call_execute].overload().implementation = function () {

            console.log("-------------------------------------HOOK SUCCESS 同步--------------------------------------------------")

            var response = this[M_Call_execute]()

            var newResponse = buildNewResponse(response)

            return newResponse;
        }
    })

}


/**
* print request history
*/
function history() {
    Java.perform(function () {
        try {
            console.log("")
            console.log("History Size : " + CallCache.length)
            for (var i = 0; i < CallCache.length; i++) {
                var call = CallCache[i]
                if ("" != M_Call_request) {
                    console.log("History index[" + i + "]" + " >> " + call[M_Call_request]())
                } else {
                    console.log("History index[" + i + "]" + "    ????  M_Call_execute = \"\"")
                }

            }
            console.log("")
        } catch (error) {
            console.log(error)
        }
    })
}

/**
* resend request
*/
function resend(index) {

    Java.perform(function () {

        try {
            console.log("resend >> " + index)
            var call = CallCache[index]
            if ("" != M_Call_execute) {
                call[M_Call_execute]()
            } else {
                console.log("M_Call_execute = null")
            }


        } catch (error) {
            console.log("Error : " + error)
        }
    })

}



/**
 * start hook 
 */
function hold() {
    Java.perform(function () {

        Java.openClassFile("/data/local/tmp/okhttpfind.dex").load()

        var OkHttpClient = Java.use(Cls_OkHttpClient)

        OkHttpClient[M_Client_newCall].overload(Cls_Request).implementation = function (request) {

            var call = this[M_Client_newCall](request)

            try {
                CallCache.push(call[M_Call_clone]())
            } catch (error) {
                console.log("not fount clone method!")
            }


            var realCallClassName = call.$className

            if (!alreadyHook(realCallClassName)) {
                hookedArray.push(realCallClassName)
                hookRealCall(realCallClassName)
            }
            return call;
        }

    })
}

/**
 * switch classloader
 */
function switchLoader(clientName) {
    Java.perform(function () {

        if ("" != clientName) {
            try {
                var clz = Java.classFactory.loader.findClass(clientName)
                console.log("")
                console.log(">>>>>>>>>>>>>  ", clz, "  <<<<<<<<<<<<<<<<")
            } catch (error) {
                console.log(error)
                Java.enumerateClassLoaders({
                    onMatch: function (loader) {
                        try {
                            if (loader.findClass(clientName)) {
                                Java.classFactory.loader = loader
                                console.log("")
                                console.log("Switch ClassLoader To : ", loader)
                                console.log("")
                            }
                        } catch (error) {
                            // console.log(error)
                        }

                    },
                    onComplete: function () {
                        console.log("")
                        try {
                            if (Java.classFactory.loader.findClass("okhttp3.Protocol")) {
                                console.log("Switch ClassLoader Success !")
                            }
                        } catch (error) {
                            console.log("Switch ClassLoader Failed !")
                        }

                        console.log("")
                    }

                })
            }
        }



    })
}



/**
 * find & print used location
 */
function find() {
    Java.perform(function () {
        var ok_loadedClazzList = Java.use("java.util.ArrayList").$new()
        var okio_loadedClazzList = Java.use("java.util.ArrayList").$new()

        console.log("")
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Start Find~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")

        Java.enumerateLoadedClasses({
            onMatch: function (name, hanlde) {
                if (name.indexOf(okhttpPackageName) == 0) {
                    console.log(name)
                    var loadedClazz = Java.use(name).class
                    ok_loadedClazzList.add(loadedClazz)
                } else if (name.indexOf(okioPackageName) == 0) {
                    console.log(name)
                    var loadedClazz = Java.use(name).class
                    okio_loadedClazzList.add(loadedClazz)
                }

            }, onComplete: function () {
                console.log(" ")
                console.log("enum loaded classes Complete ! ")
                console.log(" ")
            }
        })

        Java.openClassFile("/data/local/tmp/okhttpfind.dex").load()

        Java.use("com.singleman.okhttp.OKLog").debugLog.implementation = function (message) {
            if (message.indexOf("Start Find") != -1) {
                console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Find Result~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")
            }
            if (message.indexOf("Find Complete") != -1) {
                var OkCompatClazz = Java.use("com.singleman.okhttp.OkCompat").class
                var fields = OkCompatClazz.getDeclaredFields();
                for (var i = 0; i < fields.length; i++) {
                    var field = fields[i]
                    field.setAccessible(true);
                    var name = field.getName()
                    var value = field.get(null)

                    console.log("var " + name + " = \"" + value + "\";")
                }

                console.log("")
                console.log("   !!!!!!!!!   Please check whether [M_rsp_headers] is \"trailers\"   !!!!!!!!!    ")
                console.log("")
                console.log(message)
            }
        }

        Java.use("com.singleman.okhttp.OKLog").debugException.implementation = function (ex) {
            console.log(Java.use("android.util.Log").getStackTraceString(ex))
        }

        var OkHttpPrinter = Java.use("com.singleman.okhttp.OkHttpFinder")

        OkHttpPrinter.getInstance().findClassInit(ok_loadedClazzList, okio_loadedClazzList)

    })

}



/**
 * 
 */
function main() {
    Java.perform(function () {
        console.log("");
        console.log("------------------------- OkHttp Poker by SingleMan ------------------------------------");
        console.log("API:")
        console.log("   >>>  find()                                         寻找okhttp3关键类及函数");
        console.log("   >>>  switchLoader(\"okhttp3.OkHttpClient\")           参数：静态分析到的okhttpclient类名");
        console.log("   >>>  hold()                                         开启HOOK拦截");
        console.log("   >>>  history()                                      打印可重新发送的请求");
        console.log("   >>>  resend(index)                                  重新发送请求");
        console.log("----------------------------------------------------------------------------------------");

    })
}


setImmediate(main)











